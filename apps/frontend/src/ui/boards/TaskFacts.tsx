import { Avatar } from '@linagora/twake-mui'
import { CalendarToday, Flag, Icon } from '@linagora/twake-icons'
import type { ReactElement } from 'react'

import { AvatarStack, MetaChip } from '@/ds/Columns'
import type { Person, Priority, Task } from '@/domain/board'
import { displayName } from '@/domain/person'
import { dueLabel, shortDay, urgency } from '@/ui/boards/dueLabel'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import { useI18n } from '@/ui/i18n/useI18n'

const PRIORITY_TONE = {
  1: 'error',
  2: 'warning',
  3: 'info',
  4: 'neutral'
} as const

export function PriorityChip({
  priority
}: {
  priority: Priority
}): ReactElement {
  const { t } = useI18n()
  return (
    <MetaChip
      icon={<Icon icon={Flag} />}
      tone={PRIORITY_TONE[priority]}
      label={t('board.priorityLabel', { level: priority })}
    >
      {t('board.priority', { level: priority })}
    </MetaChip>
  )
}

export function DueChip({ task }: { task: Task }): ReactElement | null {
  const { t, lang } = useI18n()
  const due = dueLabel(task, lang)
  if (!task.dueDate || !due) return null
  const tone = urgency(task)
  return (
    <MetaChip
      icon={<Icon icon={CalendarToday} />}
      tone={tone}
      label={
        tone === 'error'
          ? t('board.overdue', { date: due })
          : t('board.due', { date: due })
      }
    >
      {shortDay(task.dueDate, lang)}
    </MetaChip>
  )
}

export function Assignees({ people }: { people: Person[] }): ReactElement {
  const { t } = useI18n()
  const shown = people.length > 3 ? 2 : 3
  const hidden = people.length - shown
  return (
    <AvatarStack>
      {people.slice(0, shown).map(person => (
        <PersonAvatar
          key={person.userId}
          email={person.email}
          name={person.name}
          label={t('board.assignee', { name: displayName(person) })}
        />
      ))}
      {hidden > 0 && (
        <Avatar
          size={24}
          role="img"
          aria-label={t('board.moreAssignees', { smart_count: hidden })}
        >
          {`+${String(hidden)}`}
        </Avatar>
      )}
    </AvatarStack>
  )
}
