import { Button, TextField, Typography } from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'
import Markdown from 'react-markdown'

import type { Task } from '@/domain/board'
import { useAddComment, useComments } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

export function Comments({
  task,
  boardId
}: {
  task: Task
  boardId: string
}): ReactElement {
  const { t, lang } = useI18n()
  const comments = useComments(boardId, task.id)
  const add = useAddComment(boardId, task.id)
  const [body, setBody] = useState('')
  const format = new Intl.DateTimeFormat(lang, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })

  return (
    <section aria-label={t('task.comments')}>
      <Typography variant="h6">{t('task.comments')}</Typography>
      {comments.isError && (
        <Typography role="alert">{t('task.commentsFailed')}</Typography>
      )}
      {comments.data?.map(comment => (
        <article key={comment.id} aria-label={comment.author.email}>
          <Typography variant="caption" color="textSecondary">
            {`${comment.author.email} · ${format.format(new Date(comment.createdAt))}`}
          </Typography>
          <Markdown>{comment.body}</Markdown>
        </article>
      ))}
      <form
        onSubmit={event => {
          event.preventDefault()
          add.mutate(body.trim(), {
            onSuccess: () => {
              setBody('')
            }
          })
        }}
      >
        <TextField
          label={t('task.comment')}
          value={body}
          onChange={event => {
            setBody(event.target.value)
          }}
          multiline
          fullWidth
          margin="dense"
          slotProps={{ htmlInput: { maxLength: 10_000 } }}
        />
        {add.isError && (
          <Typography role="alert" variant="caption">
            {t('task.commentFailed')}
          </Typography>
        )}
        <Button
          type="submit"
          size="small"
          disabled={add.isPending || !body.trim()}
        >
          {t('task.send')}
        </Button>
      </form>
    </section>
  )
}
