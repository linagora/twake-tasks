import { Alert } from '@linagora/twake-mui'
import type { ReactElement } from 'react'
import { useSearchParams } from 'react-router'

import { Toast } from '@/ds/Toast'
import type { Task } from '@/domain/board'
import { useI18n } from '@/ui/i18n/useI18n'
import { useDuplicateTask } from '@/ui/queries/tasks'

const MAX_TITLE = 500

/** Copies the task, then opens the copy in the panel. */
export function useDuplicate(
  boardId: string,
  task: Task
): { duplicate: () => void; notice: ReactElement } {
  const { t } = useI18n()
  const [, setParams] = useSearchParams()
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
            setParams(
              current => {
                const next = new URLSearchParams(current)
                next.set('task', key)
                next.delete('comment')
                return next
              },
              { replace: true }
            )
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
