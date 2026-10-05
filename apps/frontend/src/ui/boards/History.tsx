import { Typography } from '@linagora/twake-mui'
import type { ReactElement } from 'react'

import type { HistoryEntry } from '@/application/boards'
import type { Board, Task } from '@/domain/board'
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
  const actor = entry.actor.email
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
      const name =
        board?.members.find(member => member.userId === value)?.email ??
        t('history.someone')
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
      <Typography variant="h6">{t('history.heading')}</Typography>
      {history.isError && (
        <Typography role="alert">{t('history.loadFailed')}</Typography>
      )}
      <ul aria-label={t('history.heading')}>
        {history.data?.map((entry, index) => (
          <li key={index}>
            <Typography variant="body2">
              {`${describe(entry, board.data, t)} · ${format.format(new Date(entry.at))}`}
            </Typography>
          </li>
        ))}
      </ul>
    </>
  )
}
