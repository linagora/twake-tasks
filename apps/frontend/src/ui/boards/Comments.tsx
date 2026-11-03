import { Pen } from '@linagora/twake-icons'
import { Button, Link, Tooltip, Typography } from '@linagora/twake-mui'
import { useMemo, useState, type ReactElement } from 'react'

import { ApiError } from '@/application/boards'
import { Highlight } from '@/ds/Highlight'
import { RichText, RichTextEditor } from '@/ds/RichText'
import { Feed, FeedAction, FeedItem } from '@/ds/SidePanel'
import type { Person, Task } from '@/domain/board'
import { displayName } from '@/domain/person'
import { CommentReactions, ReactButton } from '@/ui/boards/CommentReactions'
import { momentFormat } from '@/ui/boards/dueLabel'
import { matchingPeople, suggestionOrder } from '@/ui/boards/people'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import { CommentHistory } from '@/ui/boards/CommentHistory'
import {
  useAddComment,
  useComments,
  useEditComment,
  useReact
} from '@/ui/queries/comments'
import { useUnsaved } from '@/ui/boards/unsaved'
import { useEmojiInput } from '@/ui/boards/useEmojiInput'
import { useRichTextLabels } from '@/ui/boards/useRichTextLabels'
import { useDrivePicker } from '@/ui/drive/useDrivePicker'
import { useI18n } from '@/ui/i18n/useI18n'
import { useSession } from '@/ui/session/SessionGate'

const MAX_COMMENT = 10_000
const MAX_SUGGESTIONS = 8

export function Comments({
  task,
  boardId,
  members,
  tasks,
  archived
}: {
  task: Task
  boardId: string
  members: Person[]
  tasks: Task[]
  archived: boolean
}): ReactElement {
  const { t, lang } = useI18n()
  const { user } = useSession()
  const labels = useRichTextLabels()
  const drive = useDrivePicker()
  const emojiInput = useEmojiInput()
  const comments = useComments(boardId, task.id)
  const add = useAddComment(boardId, task.id)
  const myEmail = user.email?.toLowerCase() ?? ''
  const me: Person = members.find(
    person => person.email.toLowerCase() === myEmail
  ) ?? { userId: '', email: myEmail, name: user.name }
  const react = useReact(boardId, task.id, me)
  const [body, setBody] = useState('')
  const [draft, setDraft] = useState(0)
  const edit = useEditComment(boardId, task.id)
  const [editing, setEditing] = useState<{
    id: string
    initial: string
    body: string
  } | null>(null)
  const [historyId, setHistoryId] = useState<string | null>(null)
  const historyOf = comments.data?.find(comment => comment.id === historyId)
  useUnsaved(
    body.trim() !== '' || (editing !== null && editing.body !== editing.initial)
  )
  const format = momentFormat(lang)
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
  const tools = {
    labels,
    minHeight: 48,
    mentions: names,
    linkPicker: drive.linkPicker,
    emoji: emojiInput.emoji,
    suggestions: [
      {
        trigger: '@',
        label: t('editor.mentionsLabel'),
        search: (query: string) =>
          mentionable(query).map(person => ({
            key: person.userId,
            insert: [
              { type: 'mention', attrs: { email: person.email } },
              { type: 'text', text: ' ' }
            ],
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
      },
      emojiInput.suggestions
    ]
  }
  const savable =
    editing !== null &&
    !edit.isPending &&
    editing.body.trim() !== '' &&
    editing.body.length <= MAX_COMMENT
  const save = () => {
    if (!editing || !savable) return
    if (editing.body === editing.initial) {
      setEditing(null)
      return
    }
    edit.mutate(
      { commentId: editing.id, body: editing.body },
      {
        onSuccess: () => {
          setEditing(null)
        }
      }
    )
  }

  return (
    <section aria-label={t('task.comments')}>
      {comments.isError && (
        <Typography role="alert">{t('task.commentsFailed')}</Typography>
      )}
      <Feed label={t('task.comments')}>
        {comments.data?.map(comment => {
          const isEditing = !archived && editing?.id === comment.id
          const mine = comment.author.email.toLowerCase() === myEmail
          return (
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
              {...(archived || isEditing
                ? {}
                : {
                    actions: (
                      <>
                        {mine && (
                          <FeedAction
                            label={t('task.editComment')}
                            icon={Pen}
                            onClick={() => {
                              edit.reset()
                              setEditing({
                                id: comment.id,
                                initial: comment.body,
                                body: comment.body
                              })
                            }}
                          />
                        )}
                        <ReactButton
                          reactions={comment.reactions}
                          me={me}
                          emojiInput={emojiInput}
                          onReact={(emoji, on) => {
                            react.mutate({ commentId: comment.id, emoji, on })
                          }}
                        />
                      </>
                    )
                  })}
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
                            onClick={() => {
                              setHistoryId(comment.id)
                            }}
                          >
                            {t('task.edited')}
                          </Link>
                        </Tooltip>
                      </>
                    )}
                  </Typography>
                </Typography>
                {isEditing ? (
                  <form
                    className="u-mt-half"
                    onSubmit={event => {
                      event.preventDefault()
                      save()
                    }}
                  >
                    <RichTextEditor
                      label={t('task.editComment')}
                      initial={comment.body}
                      onChange={next => {
                        setEditing(
                          previous => previous && { ...previous, body: next }
                        )
                      }}
                      onSubmit={save}
                      focusOnOpen
                      {...tools}
                      footer={
                        <>
                          <Button
                            variant="secondary"
                            size="small"
                            className="u-ml-auto"
                            onClick={() => {
                              setEditing(null)
                            }}
                          >
                            {t('task.cancelEdit')}
                          </Button>
                          <Button
                            type="submit"
                            size="small"
                            disabled={!savable}
                          >
                            {t('task.saveComment')}
                          </Button>
                        </>
                      }
                    />
                    {edit.isError && (
                      <Typography role="alert" variant="caption">
                        {edit.error instanceof ApiError &&
                        edit.error.code === 'too_many_mentions'
                          ? t('task.tooManyMentions')
                          : t('task.commentEditFailed')}
                      </Typography>
                    )}
                  </form>
                ) : (
                  <RichText markdown={comment.body} mentions={names} />
                )}
                <CommentReactions
                  reactions={comment.reactions}
                  me={me}
                  readOnly={archived}
                  onReact={(emoji, on) => {
                    react.mutate({ commentId: comment.id, emoji, on })
                  }}
                />
              </article>
            </FeedItem>
          )
        })}
      </Feed>
      {react.isError && (
        <Typography role="alert" variant="caption">
          {t('task.reactionFailed')}
        </Typography>
      )}
      {!archived && (
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
            onChange={setBody}
            onSubmit={send}
            focusOnOpen={draft > 0}
            {...tools}
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
              {add.error instanceof ApiError &&
              add.error.code === 'too_many_mentions'
                ? t('task.tooManyMentions')
                : t('task.commentFailed')}
            </Typography>
          )}
        </form>
      )}
      {drive.dialog}
      {historyOf && (
        <CommentHistory
          boardId={boardId}
          taskId={task.id}
          comment={historyOf}
          mentions={names}
          onClose={() => {
            setHistoryId(null)
          }}
        />
      )}
    </section>
  )
}
