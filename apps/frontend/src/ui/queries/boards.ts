import {
  skipToken,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'

import {
  ApiError,
  type BoardsApi,
  type DayCount,
  type ExportedTask,
  type HiddenTask,
  type ImportResult,
  type ImportRow,
  type KeyPrefixCheck,
  type NewBoard,
  type Project,
  type Shelf,
  type TaskChanges
} from '@/application/boards'
import {
  type Board,
  type BoardSummary,
  type Layout,
  type Task
} from '@/domain/board'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { localZone } from '@/ui/boards/dueLabel'
import { keys } from '@/ui/queries/keys'

export const POLL_MS = 60_000
// Any write marks the boards and agendas stale at once (makeQueryClient), so
// this only delays changes made by someone else.
export const LIST_STALE_MS = 30_000

const taskEditKey = (boardId: string) => ['taskEdit', boardId] as const

// Disabled rather than given `skipToken`: the query runs the function of the
// observer that rendered last, so a `skipToken` there fails the next reload.
function useCachedBoardOf<T>(
  boardId: string,
  select: (board: Board) => T
): T | undefined {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.board(boardId),
    queryFn: () => api.getBoard(boardId),
    enabled: false,
    select
  }).data
}

const whole = (board: Board) => board

/** The board as last fetched, without fetching it. */
export function useCachedBoard(boardId: string): Board | undefined {
  return useCachedBoardOf(boardId, whole)
}

/** The tasks of these boards as last fetched, without fetching them. */
export function useCachedTasks(boardIds: string[]): Task[] {
  const api = useBoardsApi()
  return useQueries({
    queries: boardIds.map(boardId => ({
      queryKey: keys.board(boardId),
      queryFn: () => api.getBoard(boardId),
      enabled: false
    })),
    combine: results => results.flatMap(result => result.data?.tasks ?? [])
  })
}

/** The task's sub-tasks as last fetched: renders again only when they change. */
export function useSubtasks(boardId: string, parentId: string): Task[] {
  const select = useCallback(
    (board: Board) => board.tasks.filter(task => task.parentId === parentId),
    [parentId]
  )
  return useCachedBoardOf(boardId, select) ?? []
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

// Under the board's key, so whatever reloads the board reloads it too.
export function useCompletions(boardId: string): UseQueryResult<DayCount[]> {
  const api = useBoardsApi()
  const zone = localZone()
  return useQuery({
    queryKey: keys.completions(boardId, zone),
    queryFn: () => api.completions(boardId, zone)
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
    queryFn: () => api.listBoards(localZone()),
    staleTime: LIST_STALE_MS,
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
// the stream was reconnecting or closed. The stream opens with the current
// version, so a view that mounts does not read the board itself. Every view
// of the board watches it and reads count against the person's budget, so a
// read already under way may bring the version and is awaited before reading
// again.
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
      // The version of this person's own edit may come before its answer,
      // which brings that version without a read.
      const editing = () =>
        queryClient.isMutating({ mutationKey: taskEditKey(boardId) }) > 0
      if (editing()) {
        const unsubscribe = queryClient.getMutationCache().subscribe(() => {
          if (editing()) return
          unsubscribe()
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
    queryFn: () => api.getBoard(boardId),
    staleTime: Infinity
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

// Only fields the server stores as sent: a date change moves others with it.
type PlainChanges = Pick<TaskChanges, 'title' | 'priority'>

// The board is read again only when a write made elsewhere came between its
// last read and this one, which the answer's version tells.
export function useTaskEdit(
  boardId: string,
  taskId: string
): UseMutationResult<{ version: number }, Error, PlainChanges> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  const queryKey = keys.board(boardId)
  // A rename shows in the blockers of the tasks it blocks too.
  const applied = (board: Board, changes: PlainChanges): Board => {
    const key = board.tasks.find(task => task.id === taskId)?.key
    const { title } = changes
    return Object.assign({}, board, {
      tasks: board.tasks.map(task =>
        task.id === taskId
          ? { ...task, ...changes }
          : title === undefined
            ? task
            : {
                ...task,
                blockers: task.blockers.map(blocker =>
                  blocker?.key === key ? { ...blocker, title } : blocker
                )
              }
      )
    })
  }
  return useMutation({
    mutationKey: taskEditKey(boardId),
    mutationFn: changes => api.editTask(boardId, taskId, changes),
    onMutate: async changes => {
      await queryClient.cancelQueries({ queryKey, exact: true })
      const shown = queryClient.getQueryData<Board>(queryKey)
      if (shown) queryClient.setQueryData(queryKey, applied(shown, changes))
      return { shown }
    },
    onSuccess: ({ version }, changes) => {
      const board = queryClient.getQueryData<Board>(queryKey)
      if (board && version === board.version + 1) {
        queryClient.setQueryData(queryKey, {
          ...applied(board, changes),
          version
        })
      } else if (!board || version > board.version) {
        void queryClient.invalidateQueries({ queryKey })
      }
    },
    onError: (_error, _changes, context) => {
      if (context?.shown) queryClient.setQueryData(queryKey, context.shown)
      void queryClient.invalidateQueries({ queryKey })
    },
    // What hangs under the board, its history and links among them, reads
    // again; the board itself only when `onSuccess` says so.
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey,
        predicate: query => query.queryKey.length > queryKey.length
      })
  })
}

export function useExportTasks(
  boardId: string
): UseMutationResult<ExportedTask[], Error, boolean> {
  const api = useBoardsApi()
  return useMutation({
    mutationFn: (withArchived: boolean) =>
      api.exportTasks(boardId, withArchived)
  })
}

export function useImportTasks(
  boardId: string
): UseMutationResult<ImportResult, Error, ImportRow[]> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (rows: ImportRow[]) => api.importTasks(boardId, rows),
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

export function useSetBoardTemplate(): UseMutationResult<
  void,
  Error,
  { boardId: string; on: boolean }
> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ boardId, on }) => api.setBoardTemplate(boardId, on),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.boards() })
  })
}

export function useLeaveBoard(
  boardId: string
): UseMutationResult<void, Error, string> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => api.removeMember(boardId, userId),
    // The project's boards and tasks are gone from every screen. Refetched
    // now, the board still open would turn not found before the page leaves it.
    onSuccess: () => {
      const left = keys.board(boardId)
      void queryClient.invalidateQueries({
        queryKey: left,
        refetchType: 'none'
      })
      void queryClient.invalidateQueries({
        predicate: query => left.some((part, at) => query.queryKey[at] !== part)
      })
    }
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
