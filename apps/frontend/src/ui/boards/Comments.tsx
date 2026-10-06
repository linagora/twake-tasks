import { Button, Typography } from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'

import { RichText, RichTextEditor } from '@/ds/RichText'
import { Feed, FeedItem } from '@/ds/SidePanel'
import type { Task } from '@/domain/board'
import { displayName } from '@/domain/person'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import { useAddComment, useComments } from '@/ui/boards/queries'
import { useRichTextLabels } from '@/ui/boards/useRichTextLabels'
import { useI18n } from '@/ui/i18n/useI18n'

const MAX_COMMENT = 10_000

export function Comments({
  task,
  boardId
}: {
  task: Task
  boardId: string
}): ReactElement {
  const { t, lang } = useI18n()
  const labels = useRichTextLabels()
  const comments = useComments(boardId, task.id)
  const add = useAddComment(boardId, task.id)
  const [body, setBody] = useState('')
  const [draft, setDraft] = useState(0)
  const format = new Intl.DateTimeFormat(lang, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
  const sendable = !add.isPending && body !== '' && body.length <= MAX_COMMENT
  const send = () => {
    if (!sendable) return
    add.mutate(body, {
      onSuccess: () => {
        setBody('')
        setDraft(previous => previous + 1)
      }
    })
  }

  return (
    <section aria-label={t('task.comments')}>
      {comments.isError && (
        <Typography role="alert">{t('task.commentsFailed')}</Typography>
      )}
      <Feed label={t('task.comments')}>
        {comments.data?.map(comment => (
          <FeedItem
            key={comment.id}
            avatar={
              <PersonAvatar
                email={comment.author.email}
                name={comment.author.name}
                size={28}
              />
            }
          >
            <article aria-label={displayName(comment.author)}>
              <Typography variant="body2" component="div">
                <strong>{displayName(comment.author)}</strong>
                <Typography
                  component="span"
                  variant="caption"
                  color="textSecondary"
                >
                  {` · ${format.format(new Date(comment.createdAt))}`}
                </Typography>
              </Typography>
              <RichText markdown={comment.body} />
            </article>
          </FeedItem>
        ))}
      </Feed>
      <form
        className="u-mt-1"
        onSubmit={event => {
          event.preventDefault()
          send()
        }}
      >
        <RichTextEditor
          key={draft}
          label={t('task.comment')}
          initial=""
          placeholder={t('editor.commentPlaceholder')}
          labels={labels}
          minHeight={48}
          onChange={setBody}
          onSubmit={send}
          footer={
            <>
              <Typography
                variant="caption"
                color="textSecondary"
                className="u-mr-auto u-ml-half"
              >
                {t('editor.sendHint')}
              </Typography>
              <Button type="submit" size="small" disabled={!sendable}>
                {t('task.send')}
              </Button>
            </>
          }
        />
        {add.isError && (
          <Typography role="alert" variant="caption">
            {t('task.commentFailed')}
          </Typography>
        )}
      </form>
    </section>
  )
}
