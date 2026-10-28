import { useState, type ReactElement } from 'react'

import { PickerError } from '@/ds/Picker'
import type { Person, Task } from '@/domain/board'
import { PeopleMenu } from '@/ui/boards/PeopleMenu'
import { useBoardChange } from '@/ui/queries/boards'
import { useI18n } from '@/ui/i18n/useI18n'

export function AssignPicker({
  task,
  boardId,
  members,
  tasks,
  shareable,
  anchor,
  onClose
}: {
  task: Task
  boardId: string
  members: Person[]
  tasks: Task[]
  /** Whether the user may see the board's pending invites. */
  shareable: boolean
  anchor: HTMLElement
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const initial = () => new Set(task.assignees.map(person => person.userId))
  const [pinned] = useState(initial)
  const [chosen, setChosen] = useState(initial)
  const assign = useBoardChange(boardId, (api, userIds: string[]) =>
    api.setAssignees(boardId, task.id, userIds)
  )

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
    <PeopleMenu
      label={t('board.assignTitle', { key: task.key })}
      boardId={boardId}
      members={members}
      tasks={tasks}
      shareable={shareable}
      pinned={pinned}
      chosen={chosen}
      onToggle={toggle}
      anchor={anchor}
      onClose={onClose}
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
    />
  )
}
