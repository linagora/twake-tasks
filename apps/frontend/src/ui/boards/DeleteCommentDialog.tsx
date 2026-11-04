import type { ReactElement } from 'react'

import { ConfirmDialog } from '@/ds/ConfirmDialog'
import { useDeleteComment } from '@/ui/queries/comments'
import { useI18n } from '@/ui/i18n/useI18n'

export function DeleteCommentDialog({
  boardId,
  taskId,
  commentId,
  onClose
}: {
  boardId: string
  taskId: string
  commentId: string
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const remove = useDeleteComment(boardId, taskId)
  return (
    <ConfirmDialog
      labels={{
        title: t('task.deleteCommentTitle'),
        text: t('task.deleteCommentText'),
        cancel: t('board.cancel'),
        confirm: t('task.deleteComment')
      }}
      pending={remove.isPending}
      error={remove.isError && t('task.commentDeleteFailed')}
      onCancel={onClose}
      onConfirm={() => {
        remove.mutate(commentId, { onSuccess: onClose })
      }}
    />
  )
}
