import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup
} from '@linagora/twake-mui'
import { useId, useState, type ReactElement } from 'react'

import type { Person, Task } from '@/domain/board'
import { useBoardChange } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

export function AssignDialog({
  task,
  boardId,
  members,
  onClose
}: {
  task: Task
  boardId: string
  members: Person[]
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const [chosen, setChosen] = useState(
    () => new Set(task.assignees.map(assignee => assignee.userId))
  )
  const assign = useBoardChange(boardId, (api, userIds: string[]) =>
    api.setAssignees(boardId, task.id, userIds)
  )
  const toggle = (userId: string) => {
    setChosen(previous => {
      const next = new Set(previous)
      if (!next.delete(userId)) next.add(userId)
      return next
    })
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="small">
      <form
        onSubmit={event => {
          event.preventDefault()
          assign.mutate([...chosen], { onSuccess: onClose })
        }}
      >
        <DialogTitle id={titleId}>
          {t('board.assignTitle', { key: task.key })}
        </DialogTitle>
        <DialogContent>
          <FormGroup>
            {members.map(member => (
              <FormControlLabel
                key={member.userId}
                label={member.email}
                control={
                  <Checkbox
                    checked={chosen.has(member.userId)}
                    onChange={() => {
                      toggle(member.userId)
                    }}
                  />
                }
              />
            ))}
          </FormGroup>
          {assign.isError && <p role="alert">{t('board.assignFailed')}</p>}
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={onClose}>
            {t('board.cancel')}
          </Button>
          <Button type="submit" disabled={assign.isPending}>
            {t('board.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
