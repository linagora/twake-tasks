import {
  Dialog,
  DialogContent,
  Divider,
  Link,
  Tooltip,
  Typography
} from '@linagora/twake-mui'
import { Fragment, type ReactElement } from 'react'

import type { Comment } from '@/application/boards'
import { ClosableTitle } from '@/ds/ClosableTitle'
import { RichText } from '@/ds/RichText'
import { displayName } from '@/domain/person'
import { momentFormat } from '@/ui/boards/dueLabel'
import { useCommentEdits } from '@/ui/queries/comments'
import { useI18n } from '@/ui/i18n/useI18n'

/** Who wrote it and when, with the edit time opening its history. */
export function CommentByline({
  comment,
  onHistory
}: {
  comment: Comment
  onHistory: () => void
}): ReactElement {
  const { t, lang } = useI18n()
  const format = momentFormat(lang)
  return (
    <Typography variant="body2" component="div">
      <strong>{displayName(comment.author)}</strong>
      <Typography component="span" variant="caption" color="textSecondary">
        {` · ${format.format(new Date(comment.createdAt))}`}
        {comment.editedAt && (
          <>
            {' · '}
            <Tooltip
              title={format.format(new Date(comment.editedAt))}
              describeChild
            >
              <Link
                component="button"
                type="button"
                variant="caption"
                color="textSecondary"
                underline="hover"
                aria-haspopup="dialog"
                onClick={onHistory}
              >
                {t('task.edited')}
              </Link>
            </Tooltip>
          </>
        )}
      </Typography>
    </Typography>
  )
}

/** Every body an edited comment had, newest first. */
export function CommentHistory({
  boardId,
  taskId,
  comment,
  mentions,
  onClose
}: {
  boardId: string
  taskId: string
  comment: Comment
  mentions: Record<string, string>
  onClose: () => void
}): ReactElement {
  const { t, lang } = useI18n()
  const format = momentFormat(lang)
  const edits = useCommentEdits(boardId, taskId, comment.id)
  const at = (time: string) => format.format(new Date(time))
  const current = comment.editedAt ?? comment.createdAt
  // Keyed by the exact time, since versions from the same minute share a label.
  const versions = [
    {
      key: current,
      label: t('task.currentVersion', { time: at(current) }),
      body: comment.body
    },
    ...(edits.data ?? []).toReversed().map(edit => ({
      key: edit.writtenAt,
      label: t('task.earlierVersion', { time: at(edit.writtenAt) }),
      body: edit.body
    }))
  ]
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <ClosableTitle
        title={t('task.commentHistory')}
        closeLabel={t('task.close')}
        onClose={onClose}
      />
      <DialogContent className="u-pb-1-half">
        {edits.isError && (
          <Typography role="alert">{t('task.commentHistoryFailed')}</Typography>
        )}
        {versions.map((version, index) => (
          <Fragment key={version.key}>
            {index > 0 && <Divider className="u-mv-1" />}
            <article aria-label={version.label}>
              <Typography variant="caption" color="textSecondary">
                {version.label}
              </Typography>
              <RichText markdown={version.body} mentions={mentions} />
            </article>
          </Fragment>
        ))}
      </DialogContent>
    </Dialog>
  )
}
