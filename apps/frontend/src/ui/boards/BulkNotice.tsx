import { Alert, Button } from '@linagora/twake-mui'
import type { ReactElement } from 'react'

import type { BulkAction } from '@/application/boards'
import type { BulkChange } from '@/application/bulkChange'
import { ToastAboveBar } from '@/ds/SelectionBar'
import { Toast } from '@/ds/Toast'
import { useChangeTasks } from '@/ui/queries/tasks'
import { useI18n } from '@/ui/i18n/useI18n'

export interface Notice {
  action: BulkAction
  total: number
  changed: number
  /** Where the tasks went, for a move to another board. */
  board?: string
  undo: BulkChange[] | null
}

/** Says how a change of several tasks went, and takes it back. */
export function BulkNotice({
  boardId,
  notice,
  aboveBar,
  onChange
}: {
  boardId: string
  notice: Notice
  aboveBar: boolean
  onChange: (notice: Notice | null) => void
}): ReactElement {
  const { t } = useI18n()
  const undo = useChangeTasks(boardId)
  const failed = notice.changed < notice.total
  const NoticeToast = aboveBar ? ToastAboveBar : Toast

  const message = () => {
    if (notice.changed === 0) return t('bulk.failed')
    if (failed) {
      return t('bulk.partial', {
        changed: notice.changed,
        total: notice.total,
        smart_count: notice.total - notice.changed
      })
    }
    const count = { smart_count: notice.changed }
    switch (notice.action.kind) {
      case 'archive':
        return t('bulk.archived', count)
      case 'trash':
        return t('bulk.trashed', count)
      case 'transfer':
        return t('bulk.transferred', { ...count, board: notice.board ?? '' })
      default:
        return t('bulk.updated', count)
    }
  }

  return (
    <NoticeToast
      open
      autoHideDuration={failed ? null : 8000}
      onClose={(_, reason) => {
        if (reason !== 'clickaway') onChange(null)
      }}
    >
      <Alert
        severity={notice.changed === 0 ? 'error' : failed ? 'warning' : 'info'}
        role={failed ? 'alert' : 'status'}
        onClose={() => {
          onChange(null)
        }}
        action={
          notice.undo &&
          notice.undo.length > 0 && (
            <Button
              variant="text"
              size="small"
              disabled={undo.isPending}
              onClick={() => {
                if (notice.undo) {
                  undo.mutate(notice.undo, {
                    onSettled: left => {
                      onChange(
                        left?.length === 0
                          ? null
                          : { ...notice, changed: 0, undo: null }
                      )
                    }
                  })
                }
              }}
            >
              {t('archive.undo')}
            </Button>
          )
        }
      >
        {message()}
      </Alert>
    </NoticeToast>
  )
}
