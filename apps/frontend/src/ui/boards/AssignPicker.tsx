import { Typography } from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'

import {
  PickerEmpty,
  PickerError,
  PickerOption,
  PickerPopover
} from '@/ds/Picker'
import { Highlight } from '@/ds/Highlight'
import type { Person, Task } from '@/domain/board'
import { displayName } from '@/domain/person'
import { matchingPeople, suggestionOrder } from '@/ui/boards/people'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import { useBoardChange } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'
import { useSession } from '@/ui/session/SessionGate'

export function AssignPicker({
  task,
  boardId,
  members,
  tasks,
  anchor,
  onClose
}: {
  task: Task
  boardId: string
  members: Person[]
  tasks: Task[]
  anchor: HTMLElement
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const { user } = useSession()
  const initial = () => new Set(task.assignees.map(person => person.userId))
  const [pinned] = useState(initial)
  const [search, setSearch] = useState('')
  const [chosen, setChosen] = useState(initial)
  const assign = useBoardChange(boardId, (api, userIds: string[]) =>
    api.setAssignees(boardId, task.id, userIds)
  )

  const ordered = suggestionOrder(members, pinned, user.email, tasks)
  const query = search.trim()
  const shown = matchingPeople(ordered, query)

  const save = (next: Set<string>) => {
    setChosen(next)
    assign.mutate([...next], {
      onError: () => {
        setChosen(initial())
      }
    })
  }
  const toggle = (userId: string) => {
    const next = new Set(chosen)
    if (!next.delete(userId)) next.add(userId)
    save(next)
  }

  return (
    <PickerPopover
      label={t('board.assignTitle', { key: task.key })}
      anchor={anchor}
      onClose={onClose}
      searchLabel={t('board.searchPeople')}
      search={search}
      onSearch={setSearch}
      onPickFirst={() => {
        if (shown[0]) toggle(shown[0].userId)
      }}
      footer={
        assign.isError && (
          <PickerError
            retryLabel={t('board.retryAssign')}
            onRetry={() => {
              save(new Set(assign.variables))
            }}
          >
            {t('board.assignFailed')}
          </PickerError>
        )
      }
    >
      {shown.map(person => (
        <PickerOption
          key={person.userId}
          checked={chosen.has(person.userId)}
          onToggle={() => {
            toggle(person.userId)
          }}
          start={
            <PersonAvatar
              email={person.email}
              name={person.name}
              avatar={person.avatar}
            />
          }
        >
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
        </PickerOption>
      ))}
      {shown.length === 0 && (
        <PickerEmpty>{t('board.noPeopleMatch', { search: query })}</PickerEmpty>
      )}
    </PickerPopover>
  )
}
