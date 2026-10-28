import { useAlert } from '@linagora/twake-mui'
import {
  useMutation,
  useQueryClient,
  type UseMutationResult
} from '@tanstack/react-query'

import { reschedule } from '@/application/reschedule'
import type { Board, Task } from '@/domain/board'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { useI18n } from '@/ui/i18n/useI18n'
import { keys } from '@/ui/queries/keys'

/** The task shows on its new day at once, and goes back if the save fails. */
export function useReschedule(
  boardId: string
): UseMutationResult<void, Error, { task: Task; day: string | null }> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  const { showAlert } = useAlert()
  const { t } = useI18n()
  return useMutation({
    mutationFn: ({ task, day }) =>
      api.editTask(boardId, task.id, reschedule(task, day)),
    onMutate: async ({ task, day }) => {
      await queryClient.cancelQueries({ queryKey: keys.board(boardId) })
      const shown = queryClient.getQueryData<Board>(keys.board(boardId))
      if (shown) {
        const changes = reschedule(task, day)
        queryClient.setQueryData<Board>(keys.board(boardId), {
          ...shown,
          tasks: shown.tasks.map(each =>
            each.id === task.id ? { ...each, ...changes } : each
          )
        })
      }
      return { shown }
    },
    onError: (_error, _input, context) => {
      if (context?.shown) {
        queryClient.setQueryData(keys.board(boardId), context.shown)
      }
      showAlert({ message: t('archive.failed'), severity: 'error' })
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: keys.board(boardId) })
  })
}
