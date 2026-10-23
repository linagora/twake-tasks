import { Typography } from '@linagora/twake-mui'
import type { ReactElement } from 'react'

import type { HistoryEntry } from '@/application/boards'
import { Feed, FeedItem } from '@/ds/SidePanel'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import type { Board, Duration, Recurrence, Task } from '@/domain/board'
import { displayName } from '@/domain/person'
import {
  dueLabel,
  formatDay,
  momentFormat,
  recurrenceLabel
} from '@/ui/boards/dueLabel'
import { useBoard, useHistory } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

type Translate = ReturnType<typeof useI18n>['t']

const text = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : ''

const boardName = (value: unknown): string =>
  typeof value === 'object' && value !== null && 'name' in value
    ? text(value.name)
    : ''

// History logs a due date as "YYYY-MM-DD[ HH:mm[ Zone]]".
function dueOf(value: string, lang: string): string {
  const [dueDate = '', dueTime = null, dueZone = null] = value.split(' ')
  return dueLabel({ dueDate, dueTime, dueZone }, lang) ?? value
}

export function describe(
  entry: HistoryEntry,
  board: Board | undefined,
  t: Translate,
  lang: string
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
        ? t('history.dueDate', { actor, date: dueOf(value, lang) })
        : t('history.dueDateCleared', { actor })
    case 'deadline':
      return added
        ? t('history.deadline', { actor, date: formatDay(value, lang) })
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
          entry.name ??
          t(entry.to === null ? 'board.noSection' : 'history.someSection')
      })
    case 'board':
      return t('history.board', {
        actor,
        from: boardName(entry.from),
        to: boardName(entry.to)
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
      const name = member
        ? displayName(member)
        : (entry.name ?? t('history.someone'))
      return t(added ? 'history.assigned' : 'history.unassigned', {
        actor,
        name
      })
    }
    case 'labels': {
      const name =
        board?.labels.find(label => label.id === value)?.name ??
        entry.name ??
        t('history.someLabel')
      return t(added ? 'history.labeled' : 'history.unlabeled', {
        actor,
        name
      })
    }
    case 'archived':
      return t(added ? 'history.archived' : 'history.unarchived', { actor })
    case 'deleted':
      return t(added ? 'history.deleted' : 'history.restored', { actor })
    case 'recurrence': {
      const recurrence = entry.to as Recurrence | null
      return recurrence
        ? t('history.recurrence', {
            actor,
            rule: recurrenceLabel(t, recurrence)
          })
        : t('history.recurrenceCleared', { actor })
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
  const format = momentFormat(lang)

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
              {`${describe(entry, board.data, t, lang)} · `}
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
