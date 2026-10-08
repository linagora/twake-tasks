import { Button, Typography } from '@linagora/twake-mui'
import { useMemo, useState, type ReactElement } from 'react'

import { Highlight } from '@/ds/Highlight'
import { RichText, RichTextEditor } from '@/ds/RichText'
import { Feed, FeedItem } from '@/ds/SidePanel'
import type { Person, Task } from '@/domain/board'
import { displayName } from '@/domain/person'
import { matchingPeople, suggestionOrder } from '@/ui/boards/people'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import { useAddComment, useComments } from '@/ui/boards/queries'
import { useRichTextLabels } from '@/ui/boards/useRichTextLabels'
import { useI18n } from '@/ui/i18n/useI18n'
import { useSession } from '@/ui/session/SessionGate'

const MAX_COMMENT = 10_000
const MAX_SUGGESTIONS = 8

export function Comments({
  task,
  boardId,
  members,
  tasks
}: {
  task: Task
  boardId: string
  members: Person[]
  tasks: Task[]
}): ReactElement {
  const { t, lang } = useI18n()
  const { user } = useSession()
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
  const mentionable = (query: string) => {
    const pinned = new Set(task.assignees.map(person => person.userId))
    const found = matchingPeople(
      suggestionOrder(members, pinned, null, tasks),
      query
    )
    // Mentioning yourself tells nobody: you come last
    const isMe = (person: Person) =>
      person.email.toLowerCase() === user.email?.toLowerCase()
    return [
      ...found.filter(person => !isMe(person)),
      ...found.filter(isMe)
    ].slice(0, MAX_SUGGESTIONS)
  }
  const names = useMemo(
    () =>
      Object.fromEntries(
        members.map(person => [person.email.toLowerCase(), displayName(person)])
      ),
    [members]
  )
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
                avatar={comment.author.avatar}
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
              <RichText markdown={comment.body} mentions={names} />
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
          suggestions={{
            trigger: '@',
            label: t('editor.mentionsLabel'),
            search: query =>
              mentionable(query).map(person => ({
                key: person.userId,
                insert: `@${person.email} `,
                label: (
                  <>
                    <PersonAvatar
                      email={person.email}
                      name={person.name}
                      avatar={person.avatar}
                    />
                    <div className="u-ellipsis">
                      <Typography variant="body2" className="u-ellipsis">
                        <Highlight text={displayName(person)} query={query} />
                      </Typography>
                      {displayName(person) !== person.email && (
                        <Typography
                          variant="caption"
                          color="textSecondary"
                          component="div"
                          className="u-ellipsis"
                        >
                          <Highlight text={person.email} query={query} />
                        </Typography>
                      )}
                    </div>
                  </>
                )
              }))
          }}
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
