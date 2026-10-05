import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'

import type {
  Agenda,
  BoardsApi,
  Comment,
  Description,
  HistoryEntry,
  NewBoard,
  NewReminder,
  NewTask,
  Reminder,
  TaskMove
} from '@/application/boards'
import type { Board, BoardSummary } from '@/domain/board'
import { quickAdd } from '@/application/quickAdd'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { localToday, localZone } from '@/ui/boards/dueLabel'

const boardsKey = ['boards'] as const
const boardKey = (boardId: string) => ['boards', boardId] as const

export function useAgenda(days: number): UseQueryResult<Agenda> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: ['agenda', days],
    queryFn: () => api.agenda(localZone(), days)
  })
}

export function useBoards(): UseQueryResult<BoardSummary[]> {
  const api = useBoardsApi()
  return useQuery({ queryKey: boardsKey, queryFn: () => api.listBoards() })
}

export function useBoard(boardId: string): UseQueryResult<Board> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: boardKey(boardId),
    queryFn: () => api.getBoard(boardId)
  })
}

export function useCreateTask(
  boardId: string
): UseMutationResult<unknown, Error, NewTask> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (task: NewTask) => api.createTask(boardId, task),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: boardKey(boardId) })
  })
}

export function useMoveTask(
  boardId: string
): UseMutationResult<void, Error, { taskId: string; move: TaskMove }> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, move }) => api.moveTask(boardId, taskId, move),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: boardKey(boardId) })
  })
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
      queryClient.invalidateQueries({ queryKey: boardKey(boardId) })
  })
}

const descriptionKey = (boardId: string, taskId: string) =>
  ['boards', boardId, 'tasks', taskId, 'description'] as const

export function useDescription(
  boardId: string,
  taskId: string
): UseQueryResult<Description> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: descriptionKey(boardId, taskId),
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
        queryKey: descriptionKey(boardId, taskId)
      })
  })
}

export function useHistory(
  boardId: string,
  taskId: string
): UseQueryResult<HistoryEntry[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: ['boards', boardId, 'tasks', taskId, 'history'],
    queryFn: () => api.listHistory(boardId, taskId)
  })
}

const commentsKey = (boardId: string, taskId: string) =>
  ['boards', boardId, 'tasks', taskId, 'comments'] as const

export function useComments(
  boardId: string,
  taskId: string
): UseQueryResult<Comment[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: commentsKey(boardId, taskId),
    queryFn: () => api.listComments(boardId, taskId)
  })
}

export function useAddComment(
  boardId: string,
  taskId: string
): UseMutationResult<void, Error, string> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => api.addComment(boardId, taskId, body),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: commentsKey(boardId, taskId) })
  })
}

const remindersKey = (boardId: string, taskId: string) =>
  ['boards', boardId, 'tasks', taskId, 'reminders'] as const

export function useReminders(
  boardId: string,
  taskId: string
): UseQueryResult<Reminder[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: remindersKey(boardId, taskId),
    queryFn: () => api.listReminders(boardId, taskId)
  })
}

export function useAddReminder(
  boardId: string,
  taskId: string
): UseMutationResult<void, Error, NewReminder> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reminder: NewReminder) =>
      api.addReminder(boardId, taskId, reminder),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: remindersKey(boardId, taskId) })
  })
}

export function useDeleteReminder(
  boardId: string,
  taskId: string
): UseMutationResult<void, Error, string> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reminderId: string) =>
      api.deleteReminder(boardId, taskId, reminderId),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: remindersKey(boardId, taskId) })
  })
}

export function useQuickAdd(): UseMutationResult<
  { boardId: string; key: string },
  Error,
  string
> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (line: string) => quickAdd(api, line, localToday()),
    onSuccess: ({ boardId }) =>
      queryClient.invalidateQueries({ queryKey: boardKey(boardId) })
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
      queryClient.invalidateQueries({ queryKey: boardsKey, exact: true })
  })
}

export function useCreateBoard(): UseMutationResult<Board, Error, NewBoard> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (board: NewBoard) => api.createBoard(board),
    onSuccess: board => {
      queryClient.setQueryData(boardKey(board.id), board)
      return queryClient.invalidateQueries({ queryKey: boardsKey, exact: true })
    }
  })
}
