import { Typography } from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'

import { PickerEmpty, PickerOption, PickerPopover } from '@/ds/Picker'
import type { Person, Task } from '@/domain/board'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import { useBoardChange } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

export function AssignPicker({
  task,
  boardId,
  members,
  anchor,
  onClose
}: {
  task: Task
  boardId: string
  members: Person[]
  anchor: HTMLElement
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const [search, setSearch] = useState('')
  const [chosen, setChosen] = useState(
    () => new Set(task.assignees.map(assignee => assignee.userId))
  )
  const assign = useBoardChange(boardId, (api, userIds: string[]) =>
    api.setAssignees(boardId, task.id, userIds)
  )
  const query = search.trim().toLowerCase()
  const shown = members.filter(member =>
    member.email.toLowerCase().includes(query)
  )
  const toggle = (userId: string) => {
    const next = new Set(chosen)
    if (!next.delete(userId)) next.add(userId)
    setChosen(next)
    assign.mutate([...next], {
      onError: () => {
        setChosen(new Set(task.assignees.map(assignee => assignee.userId)))
      }
    })
  }

  return (
    <PickerPopover
      label={t('board.assignTitle', { key: task.key })}
      anchor={anchor}
      onClose={onClose}
      searchLabel={t('board.searchPeople')}
      search={search}
      onSearch={setSearch}
      footer={
        assign.isError && (
          <Typography role="alert" variant="caption" color="error">
            {t('board.assignFailed')}
          </Typography>
        )
      }
    >
      {shown.map(member => (
        <PickerOption
          key={member.userId}
          checked={chosen.has(member.userId)}
          onToggle={() => {
            toggle(member.userId)
          }}
          start={<PersonAvatar email={member.email} />}
        >
          {member.email}
        </PickerOption>
      ))}
      {shown.length === 0 && <PickerEmpty>{t('board.noMatches')}</PickerEmpty>}
    </PickerPopover>
  )
}
