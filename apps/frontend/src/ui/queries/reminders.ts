import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'

import { type NewReminder, type Reminder } from '@/application/boards'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { keys } from '@/ui/queries/keys'
import { useTaskPart } from '@/ui/queries/taskDetails'

export function useReminders(
  boardId: string,
  taskId: string
): UseQueryResult<Reminder[]> {
  return useTaskPart(boardId, taskId, 'reminders')
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
      queryClient.invalidateQueries({
        queryKey: keys.reminders(boardId, taskId)
      })
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
      queryClient.invalidateQueries({
        queryKey: keys.reminders(boardId, taskId)
      })
  })
}
