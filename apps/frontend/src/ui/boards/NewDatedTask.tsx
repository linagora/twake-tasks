import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography
} from '@linagora/twake-mui'
import { useId, useState, type ReactElement } from 'react'

import { DayField } from '@/ds/Pickers'
import { useBoardChange } from '@/ui/boards/queries'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'

export function NewDatedTask({
  boardId,
  sectionId,
  day,
  onClose
}: {
  boardId: string
  sectionId: string | null
  day: string
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(day)
  const create = useBoardChange(boardId, async api => {
    const task = await api.createTask(boardId, {
      sectionId,
      title: title.trim()
    })
    if (dueDate) await api.editTask(boardId, task.id, { dueDate })
  })

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="small">
      <form
        onSubmit={event => {
          event.preventDefault()
          create.mutate(undefined, { onSuccess: onClose })
        }}
      >
        <DialogTitle id={titleId}>{t('board.newTask')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} className="u-pt-half">
            <TextField
              label={t('board.taskTitle')}
              value={title}
              onChange={event => {
                setTitle(event.target.value)
              }}
              size="small"
              fullWidth
              inputRef={focusOnMount}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
            <DayField
              label={t('dates.dueDate')}
              value={dueDate}
              onChange={setDueDate}
            />
            {create.isError && (
              <Typography role="alert" variant="caption">
                {t('board.addFailed')}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={onClose}>
            {t('board.cancel')}
          </Button>
          <Button type="submit" disabled={create.isPending || !title.trim()}>
            {t('board.add')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
