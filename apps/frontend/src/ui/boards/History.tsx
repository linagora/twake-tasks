import { Typography } from '@linagora/twake-mui'
import type { ReactElement } from 'react'

import type { HistoryEntry } from '@/application/boards'
import { Feed, FeedItem } from '@/ds/SidePanel'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import type { Board, Duration, Task } from '@/domain/board'
import { displayName } from '@/domain/person'
import { useBoard, useHistory } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

type Translate = ReturnType<typeof useI18n>['t']

const text = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : ''

function describe(
  entry: HistoryEntry,
  board: Board | undefined,
  t: Translate
): string {
  const actor = displayName(entry.actor)
  const value = text(entry.to ?? entry.from)
  const added = entry.to !== null
  switch (entry.field) {
    case 'created':
      return t('history.created', { actor })
    case 'title':
      return t('history.title', { actor, from: text(entry.from), to: value })
    case 'priority':
      return added
        ? t('history.priority', { actor, level: value })
        : t('history.priorityCleared', { actor })
    case 'dueDate':
      return added
        ? t('history.dueDate', { actor, date: value })
        : t('history.dueDateCleared', { actor })
    case 'deadline':
      return added
        ? t('history.deadline', { actor, date: value })
        : t('history.deadlineCleared', { actor })
    case 'duration': {
      const duration = entry.to as Duration | null
      return duration
        ? t('history.duration', {
            actor,
            duration: t(`dates.${duration.unit}`, { amount: duration.amount })
          })
        : t('history.durationCleared', { actor })
    }
    case 'section':
      return t('history.section', {
        actor,
        section:
          board?.sections.find(section => section.id === entry.to)?.name ??
          t('board.noSection')
      })
    case 'completion':
      return t(
        entry.to === 'completed'
          ? 'history.completed'
          : entry.to === 'canceled'
            ? 'history.canceled'
            : 'history.reopened',
        { actor }
      )
    case 'assignees': {
      const member = board?.members.find(each => each.userId === value)
      const name = member ? displayName(member) : t('history.someone')
      return t(added ? 'history.assigned' : 'history.unassigned', {
        actor,
        name
      })
    }
    case 'labels': {
      const name =
        board?.labels.find(label => label.id === value)?.name ??
        t('history.someLabel')
      return t(added ? 'history.labeled' : 'history.unlabeled', {
        actor,
        name
      })
    }
    default:
      return t('history.description', { actor })
  }
}

export function History({
  task,
  boardId
}: {
  task: Task
  boardId: string
}): ReactElement {
  const { t, lang } = useI18n()
  const history = useHistory(boardId, task.id)
  const board = useBoard(boardId)
  const format = new Intl.DateTimeFormat(lang, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })

  return (
    <>
      {history.isError && (
        <Typography role="alert">{t('history.loadFailed')}</Typography>
      )}
      <Feed label={t('history.heading')}>
        {history.data?.map((entry, index) => (
          <FeedItem
            key={index}
            avatar={
              <PersonAvatar
                email={entry.actor.email}
                name={entry.actor.name}
                avatar={entry.actor.avatar}
              />
            }
          >
            <Typography variant="body2">
              {`${describe(entry, board.data, t)} · `}
              <Typography
                component="span"
                variant="caption"
                color="textSecondary"
              >
                {format.format(new Date(entry.at))}
              </Typography>
            </Typography>
          </FeedItem>
        ))}
      </Feed>
    </>
  )
}
