import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography
} from '@linagora/twake-mui'
import { useId, useState, type ReactElement } from 'react'

import { ApiError } from '@/application/boards'
import { ColorSwatches } from '@/ds/ColorSwatches'
import { LabelChip } from '@/ds/Columns'
import type { Label } from '@/domain/board'
import { LABEL_COLORS } from '@/domain/labelColors'
import { useBoardChange } from '@/ui/boards/queries'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'

type Draft = Pick<Label, 'name' | 'color'>

export function LabelDialog({
  boardId,
  label,
  initialName = '',
  onSaved,
  onClose
}: {
  boardId: string
  /** The label to edit, or undefined to create one */
  label?: Label | undefined
  initialName?: string
  onSaved: (label: Label) => void
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const [name, setName] = useState(label?.name ?? initialName)
  const [color, setColor] = useState(label?.color ?? null)
  const save = useBoardChange(boardId, (api, draft: Draft) =>
    label
      ? api.editLabel(boardId, label.id, draft)
      : api.createLabel(boardId, draft)
  )
  const taken =
    save.error instanceof ApiError && save.error.code === 'label_taken'
  const trimmed = name.trim()

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="small">
      <form
        onSubmit={event => {
          event.preventDefault()
          save.mutate(
            { name: trimmed, color },
            {
              onSuccess: saved => {
                onSaved(saved as Label)
              }
            }
          )
        }}
      >
        <DialogTitle id={titleId}>
          {t(label ? 'labelDialog.editTitle' : 'labelDialog.createTitle')}
        </DialogTitle>
        <DialogContent>
          <TextField
            label={t('labelDialog.name')}
            value={name}
            onChange={event => {
              setName(event.target.value)
              save.reset()
            }}
            required
            fullWidth
            inputRef={focusOnMount}
            margin="dense"
            error={taken}
            helperText={taken && t('board.labelTaken', { name: trimmed })}
            slotProps={{ htmlInput: { maxLength: 50 } }}
          />
          <div className="u-mv-1" aria-hidden>
            <LabelChip name={trimmed || t('labelDialog.name')} color={color} />
          </div>
          <ColorSwatches
            legend={t('labelDialog.color')}
            noneLabel={t('labelDialog.noColor')}
            swatches={LABEL_COLORS.map(swatch => ({
              value: swatch.value,
              label: t(`labelColors.${swatch.name}`)
            }))}
            value={color}
            onChange={setColor}
          />
          {save.isError && !taken && (
            <Typography role="alert" color="error" className="u-mt-1">
              {t(label ? 'labelDialog.editFailed' : 'board.labelFailed')}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={onClose}>
            {t('board.cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending || !trimmed}>
            {t(label ? 'board.save' : 'labelDialog.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
