import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import {
  type Description,
  type HistoryEntry,
  type NewTask,
  type TaskMove,
  type TransferPreview
} from '@/application/boards'
import { isEditable, type Board, type BoardSummary } from '@/domain/board'
import { applyMove } from '@/application/moveTask'
import {
  createTask,
  defaultBoard,
  type NewTaskDraft,
  type StartedTask
} from '@/application/newTask'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { useBoards } from '@/ui/queries/boards'
import { keys } from '@/ui/queries/keys'

export function useCreateTask(
  boardId: string
): UseMutationResult<unknown, Error, NewTask> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (task: NewTask) => api.createTask(boardId, task),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: keys.board(boardId) })
  })
}

export function usePreviewTransfer(
  boardId: string,
  taskId: string
): UseMutationResult<
  TransferPreview,
  Error,
  { boardId: string; sectionId: string | null }
> {
  const api = useBoardsApi()
  return useMutation({
    mutationFn: to => api.previewTransfer(boardId, taskId, to)
  })
}

/**
 * Unlike the other board changes, a transfer does not refresh the board by
 * itself: the task leaves it, which closes the panel that tells the person what
 * the move dropped. Call `refresh` once they have read it.
 */
export function useTransferTask(
  boardId: string,
  taskId: string
): {
  transfer: UseMutationResult<
    { key: string } & TransferPreview,
    Error,
    { boardId: string; sectionId: string | null }
  >
  refresh: () => Promise<void>
} {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  // Exact: the moved task's comments, reminders and the rest now 404 under the
  // old board, and its panel is still open while it closes.
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: keys.board(boardId),
      exact: true
    })
  // A move that ends after the form is gone has nobody left to refresh.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const transfer = useMutation({
    mutationFn: async (to: { boardId: string; sectionId: string | null }) => {
      const result = await api.transferTask(boardId, taskId, to)
      if (!mounted.current) void refresh()
      return result
    },
    onError: refresh
  })
  return { transfer, refresh }
}

export function useMoveTask(
  boardId: string
): UseMutationResult<void, Error, { taskId: string; move: TaskMove }> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, move }) => api.moveTask(boardId, taskId, move),
    onMutate: async ({ taskId, move }) => {
      await queryClient.cancelQueries({ queryKey: keys.board(boardId) })
      const shown = queryClient.getQueryData<Board>(keys.board(boardId))
      if (shown) {
        queryClient.setQueryData<Board>(keys.board(boardId), {
          ...shown,
          tasks: applyMove(shown.tasks, taskId, move)
        })
      }
      return { shown }
    },
    onError: (_error, _input, context) => {
      if (context?.shown) {
        queryClient.setQueryData(keys.board(boardId), context.shown)
      }
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: keys.board(boardId) })
  })
}

export function useDescription(
  boardId: string,
  taskId: string
): UseQueryResult<Description> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.description(boardId, taskId),
    queryFn: () => api.getDescription(boardId, taskId)
  })
}

export function useSetDescription(
  boardId: string,
  taskId: string
): UseMutationResult<{ version: number }, Error, Description> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (edit: Description) =>
      api.setDescription(boardId, taskId, edit),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: keys.description(boardId, taskId)
      })
  })
}

export function useHistory(
  boardId: string,
  taskId: string
): UseQueryResult<HistoryEntry[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.history(boardId, taskId),
    queryFn: () => api.listHistory(boardId, taskId)
  })
}

export function useFollowing(
  boardId: string,
  taskId: string
): UseQueryResult<boolean> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.following(boardId, taskId),
    queryFn: () => api.following(boardId, taskId)
  })
}

export function useSetFollowing(
  boardId: string,
  taskId: string
): UseMutationResult<void, Error, boolean> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (following: boolean) =>
      api.setFollowing(boardId, taskId, following),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: keys.following(boardId, taskId)
      })
  })
}

export function useNewTask(): UseMutationResult<
  { boardId: string; key: string },
  Error,
  { boardId: string; draft: NewTaskDraft; started?: StartedTask | undefined }
> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ boardId, draft, started }) =>
      createTask(api, boardId, draft, started),
    // Settled, not succeeded: the task exists once its first request is done,
    // even if adding its details fails. The boards list holds the counts.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.agendas() }),
        queryClient.invalidateQueries({ queryKey: keys.searches() }),
        queryClient.invalidateQueries({ queryKey: keys.boards() })
      ])
  })
}

/**
 * The boards a new task can go in, the one it goes in (`picked`, else the
 * default one), and that board's members and labels.
 */
export function useNewTaskBoard(
  picked: string | undefined,
  inBoardId?: string,
  inProjectId?: string
): {
  targets: BoardSummary[] | undefined
  chosen: BoardSummary | undefined
  board: Board | undefined
  boardFailed: boolean
} {
  const api = useBoardsApi()
  const targets = useBoards().data?.filter(
    each =>
      isEditable(each) &&
      (inProjectId === undefined || each.project.id === inProjectId)
  )
  const chosen =
    targets &&
    (targets.find(each => each.id === picked) ??
      defaultBoard(targets, inBoardId))
  const named = useQuery({
    queryKey: keys.board(chosen?.id ?? ''),
    queryFn: chosen ? () => api.getBoard(chosen.id) : skipToken
  })
  return { targets, chosen, board: named.data, boardFailed: named.isError }
}
