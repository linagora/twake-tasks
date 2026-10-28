import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import {
  ApiError,
  type BoardsApi,
  type HiddenTask,
  type KeyPrefixCheck,
  type NewBoard,
  type Project,
  type Shelf
} from '@/application/boards'
import { type Board, type BoardSummary, type Layout } from '@/domain/board'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { keys } from '@/ui/queries/keys'

export const POLL_MS = 60_000

/** The board as last fetched, without fetching it. */
export function useCachedBoard(boardId: string): Board | undefined {
  return useQuery<Board>({ queryKey: keys.board(boardId), queryFn: skipToken })
    .data
}

export function useHiddenTasks(
  boardId: string,
  shelf: Shelf,
  enabled = true
): UseQueryResult<HiddenTask[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.shelf(boardId, shelf),
    queryFn: enabled ? () => api.hiddenTasks(boardId, shelf) : skipToken
  })
}

// `poll` follows the projects joined or left elsewhere.
export function useProjects({
  poll = false
}: { poll?: boolean } = {}): UseQueryResult<Project[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.projects(),
    queryFn: () => api.listProjects(),
    refetchInterval: poll ? POLL_MS : false
  })
}

// `poll` follows the tasks done or added elsewhere.
export function useBoards({
  poll = false
}: { poll?: boolean } = {}): UseQueryResult<BoardSummary[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.boards(),
    queryFn: () => api.listBoards(),
    refetchInterval: poll ? POLL_MS : false
  })
}

/** The board from the boards list already loaded, without subscribing to it. */
export function useListedBoard(boardId: string): BoardSummary | null {
  const queryClient = useQueryClient()
  return (
    queryClient
      .getQueryData<BoardSummary[]>(keys.boards())
      ?.find(board => board.id === boardId) ?? null
  )
}

// Reloads on a newer version: a change made elsewhere, or one missed while
// the stream was reconnecting. Every view of the board watches it and reads
// count against the person's budget, so a read already under way may bring
// the version and is awaited before reading again.
export function useBoard(boardId: string): UseQueryResult<Board> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  useEffect(() => {
    const queryKey = keys.board(boardId)
    let stopped = false
    // Checks again once the read ends: another watcher may have started the
    // next read in the meantime, or cancelled this one for its own.
    const onVersion = (version: number) => {
      if (stopped) return
      const query = queryClient
        .getQueryCache()
        .find<Board>({ queryKey, exact: true })
      const reading =
        query?.state.fetchStatus === 'fetching' ? query.promise : undefined
      if (reading) {
        void reading
          .catch(() => undefined)
          .then(() => {
            onVersion(version)
          })
        return
      }
      const shown = query?.state.data
      if (shown && version > shown.version) {
        void queryClient.invalidateQueries({ queryKey })
      }
    }
    const unwatch = api.watchBoard(boardId, onVersion)
    return () => {
      stopped = true
      unwatch()
    }
  }, [api, boardId, queryClient])
  return useQuery({
    queryKey: keys.board(boardId),
    queryFn: () => api.getBoard(boardId)
  })
}

// A project's frame opens only that project's boards: one of another project
// is refused as if it did not exist.
export function useBoardOf(
  boardId: string,
  projectId: string | undefined
): {
  board: UseQueryResult<Board>
  shown: Board | undefined
  missing: boolean
} {
  const board = useBoard(boardId)
  const foreign =
    projectId !== undefined &&
    board.data !== undefined &&
    board.data.project.id !== projectId
  const missing =
    foreign || (board.error instanceof ApiError && board.error.status === 404)
  return { board, shown: missing ? undefined : board.data, missing }
}

export function useBoardChange<T>(
  boardId: string,
  change: (api: BoardsApi, input: T) => Promise<unknown>
): UseMutationResult<unknown, Error, T> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: T) => change(api, input),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: keys.board(boardId) })
  })
}

export function useSetLayout(
  boardId: string
): UseMutationResult<void, Error, { layout: Layout; everyone: boolean }> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ layout, everyone }) =>
      everyone
        ? api.setDefaultLayout(boardId, layout)
        : api.setLayout(boardId, layout),
    onMutate: ({ layout, everyone }) => {
      queryClient.setQueryData<Board>(
        keys.board(boardId),
        board =>
          board && {
            ...board,
            layout,
            defaultLayout: everyone ? layout : board.defaultLayout
          }
      )
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: keys.board(boardId) })
  })
}

export function useRenameBoard(
  boardId: string
): UseMutationResult<void, Error, string> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.renameBoard(boardId, name),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.boards() })
  })
}

export function useSetBoardArchived(): UseMutationResult<
  void,
  Error,
  { boardId: string; archived: boolean }
> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ boardId, archived }) =>
      api.setBoardArchived(boardId, archived),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.boards() })
  })
}

export function useSetFavorite(): UseMutationResult<
  void,
  Error,
  { boardId: string; favorite: boolean }
> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ boardId, favorite }) => api.setFavorite(boardId, favorite),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: keys.boards(), exact: true })
  })
}

export function useCreateBoard(): UseMutationResult<Board, Error, NewBoard> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (board: NewBoard) => api.createBoard(board),
    onSuccess: board => {
      queryClient.setQueryData(keys.board(board.id), board)
      void queryClient.invalidateQueries({ queryKey: keys.keyPrefixes() })
      return queryClient.invalidateQueries({
        queryKey: keys.boards(),
        exact: true
      })
    },
    // Someone took the prefix since it was checked.
    onError: error => {
      if (error instanceof ApiError && error.code === 'key_prefix_taken') {
        void queryClient.invalidateQueries({ queryKey: keys.keyPrefixes() })
      }
    }
  })
}

const KEY_PREFIX_DELAY_MS = 250
const KEY_PREFIX = /^[A-Z][A-Z0-9]{0,9}$/

/** Whether `keyPrefix` is free, once typing pauses on it; undefined until then. */
export function useKeyPrefixCheck(
  keyPrefix: string
): KeyPrefixCheck | undefined {
  const api = useBoardsApi()
  const [settled, setSettled] = useState(keyPrefix)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(keyPrefix)
    }, KEY_PREFIX_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [keyPrefix])
  const { data } = useQuery({
    queryKey: keys.keyPrefix(settled),
    queryFn: () => api.checkKeyPrefix(settled),
    enabled: KEY_PREFIX.test(settled)
  })
  return settled === keyPrefix ? data : undefined
}
