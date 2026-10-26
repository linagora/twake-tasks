import { Menu, MenuItem } from '@linagora/twake-mui'
import type { ReactElement } from 'react'

import { PRIORITIES, type Task } from '@/domain/board'
import { useBoardChange } from '@/ui/boards/queries'
import { PriorityChip } from '@/ui/boards/TaskFacts'
import { useI18n } from '@/ui/i18n/useI18n'

/** The priorities of the task panel's field, picked from a cell. */
export function PriorityPicker({
  task,
  boardId,
  anchor,
  onClose
}: {
  task: Task
  boardId: string
  anchor: HTMLElement
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const edit = useBoardChange(boardId, (api, priority: Task['priority']) =>
    api.editTask(boardId, task.id, { priority })
  )

  return (
    <Menu
      open
      anchorEl={anchor}
      onClose={onClose}
      slotProps={{ list: { 'aria-label': t('task.priority') } }}
    >
      {[null, ...PRIORITIES].map(level => (
        <MenuItem
          key={level ?? 'none'}
          selected={task.priority === level}
          aria-label={
            level === null
              ? t('task.noPriority')
              : t('board.priorityLabel', { level })
          }
          onClick={() => {
            if (level !== task.priority) edit.mutate(level)
            onClose()
          }}
        >
          {level === null ? (
            t('task.noPriority')
          ) : (
            <PriorityChip priority={level} />
          )}
        </MenuItem>
      ))}
    </Menu>
  )
}
