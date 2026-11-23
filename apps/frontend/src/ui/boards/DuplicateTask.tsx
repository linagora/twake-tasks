import { Alert } from '@linagora/twake-mui'
import type { ReactElement } from 'react'

import { Toast } from '@/ds/Toast'
import type { Task } from '@/domain/board'
import { useI18n } from '@/ui/i18n/useI18n'
import { useDuplicateTask } from '@/ui/queries/tasks'

const MAX_TITLE = 500

/** Copies the task, then opens the copy in the panel. */
export function useDuplicate(
  boardId: string,
  task: Task,
  openTask: (key: string) => void
): { duplicate: () => void; notice: ReactElement } {
  const { t } = useI18n()
  const copy = useDuplicateTask(boardId)

  return {
    duplicate: () => {
      copy.mutate(
        {
          taskId: task.id,
          title: t('task.copyTitle', { title: task.title }).slice(0, MAX_TITLE)
        },
        {
          onSuccess: ({ key }) => {
            openTask(key)
          }
        }
      )
    },
    notice: (
      <Toast
        open={copy.isError}
        autoHideDuration={4000}
        onClose={() => {
          copy.reset()
        }}
      >
        <Alert severity="error" role="alert">
          {t('task.duplicateFailed')}
        </Alert>
      </Toast>
    )
  }
}
