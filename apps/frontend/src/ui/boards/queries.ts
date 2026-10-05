import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'

import type { NewBoard, NewTask, TaskMove } from '@/application/boards'
import type { Board, BoardSummary } from '@/domain/board'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'

const boardsKey = ['boards'] as const
const boardKey = (boardId: string) => ['boards', boardId] as const

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
