import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  TextField
} from '@linagora/twake-mui'
import { useId, useState, type ReactElement } from 'react'

import { ApiError } from '@/application/boards'
import type { Label, Task } from '@/domain/board'
import { useBoardChange } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

export function LabelsDialog({
  task,
  boardId,
  labels,
  onClose
}: {
  task: Task
  boardId: string
  labels: Label[]
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const [chosen, setChosen] = useState(
    () => new Set(task.labels.map(label => label.id))
  )
  const [name, setName] = useState('')
  const create = useBoardChange(boardId, (api, labelName: string) =>
    api.createLabel(boardId, labelName)
  )
  const save = useBoardChange(boardId, (api, labelIds: string[]) =>
    api.setLabels(boardId, task.id, labelIds)
  )
  const taken =
    create.error instanceof ApiError && create.error.code === 'label_taken'
  const toggle = (labelId: string) => {
    setChosen(previous => {
      const next = new Set(previous)
      if (!next.delete(labelId)) next.add(labelId)
      return next
    })
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="small">
      <DialogTitle id={titleId}>
        {t('board.labelsTitle', { key: task.key })}
      </DialogTitle>
      <DialogContent>
        <FormGroup>
          {labels.map(label => (
            <FormControlLabel
              key={label.id}
              label={label.name}
              control={
                <Checkbox
                  checked={chosen.has(label.id)}
                  onChange={() => {
                    toggle(label.id)
                  }}
                />
              }
            />
          ))}
        </FormGroup>
        <form
          onSubmit={event => {
            event.preventDefault()
            create.mutate(name.trim(), {
              onSuccess: label => {
                setName('')
                setChosen(previous =>
                  new Set(previous).add((label as Label).id)
                )
              }
            })
          }}
        >
          <TextField
            label={t('board.newLabel')}
            value={name}
            onChange={event => {
              setName(event.target.value)
              create.reset()
            }}
            size="small"
            fullWidth
            margin="dense"
            error={taken}
            helperText={
              create.isError
                ? taken
                  ? t('board.labelTaken', { name: name.trim() })
                  : t('board.labelFailed')
                : undefined
            }
            slotProps={{ htmlInput: { maxLength: 50 } }}
          />
          <Button
            type="submit"
            size="small"
            variant="text"
            disabled={create.isPending || !name.trim()}
          >
            {t('board.create')}
          </Button>
        </form>
        {save.isError && <p role="alert">{t('board.labelsFailed')}</p>}
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onClose}>
          {t('board.cancel')}
        </Button>
        <Button
          disabled={save.isPending}
          onClick={() => {
            save.mutate([...chosen], { onSuccess: onClose })
          }}
        >
          {t('board.save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
