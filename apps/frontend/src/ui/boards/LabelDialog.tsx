import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  Divider,
  Stack,
  TextField,
  Typography
} from '@linagora/twake-mui'
import { useId, useState, type ReactElement } from 'react'

import { ApiError } from '@/application/boards'
import { ColorGrid, ColorPreview } from '@/ds/ColorPicker'
import { DialogHeader } from '@/ds/DialogHeader'
import { labelName, type Label } from '@/domain/board'
import { defaultLabelColor, LABEL_COLORS } from '@/domain/labelColors'
import { useBoardChange } from '@/ui/boards/queries'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'

type Draft = Pick<Label, 'name' | 'color'>

/**
 * A label's name and color in one dialog, as a team is made in the admin
 * panel: the label's preview on top, then its name, then the swatches. A new
 * label starts with the swatch the board uses the least.
 */
export function LabelDialog({
  boardId,
  label,
  usedColors,
  initialName = '',
  onSaved,
  onClose
}: {
  boardId: string
  /** The label to edit, or undefined to create one */
  label?: Label | undefined
  /** The colors of the board's labels, which a new label avoids */
  usedColors: readonly (string | null)[]
  initialName?: string
  onSaved: (label: Label) => void
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const nameId = useId()
  const colorId = useId()
  const [name, setName] = useState(label?.name ?? initialName)
  const [color, setColor] = useState<string | null>(() =>
    label ? label.color : defaultLabelColor(usedColors)
  )
  const save = useBoardChange(boardId, (api, draft: Draft) =>
    label
      ? api.editLabel(boardId, label.id, draft)
      : api.createLabel(boardId, draft)
  )
  const taken =
    save.error instanceof ApiError && save.error.code === 'label_taken'
  const trimmed = labelName(name)

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="medium">
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
        <DialogHeader
          id={titleId}
          title={t(label ? 'labelDialog.editTitle' : 'labelDialog.createTitle')}
          close={{ label: t('labelDialog.close'), onClick: onClose }}
        />
        <DialogContent className="u-pb-1-half">
          <Stack spacing={3}>
            <Stack className="u-flex-items-center">
              <ColorPreview name={trimmed} color={color} size={72} />
            </Stack>
            <Stack spacing={1}>
              <Typography component="label" htmlFor={nameId} variant="body2">
                {t('labelDialog.name')}
              </Typography>
              <TextField
                id={nameId}
                value={name}
                onChange={event => {
                  setName(event.target.value)
                  save.reset()
                }}
                required
                fullWidth
                size="small"
                inputRef={focusOnMount}
                error={taken}
                helperText={taken && t('board.labelTaken', { name: trimmed })}
                slotProps={{ htmlInput: { maxLength: 50 } }}
              />
            </Stack>
            <Stack spacing={1.5}>
              <Typography id={colorId} variant="body2">
                {t('labelDialog.color')}
              </Typography>
              <ColorGrid
                labelledBy={colorId}
                none={t('labelDialog.noColor')}
                swatches={LABEL_COLORS.map(swatch => ({
                  value: swatch.value,
                  label: t(`labelColors.${swatch.name}`)
                }))}
                value={color}
                onChange={setColor}
              />
            </Stack>
          </Stack>
          {save.isError && !taken && (
            <Typography role="alert" color="error" className="u-mt-1">
              {t(label ? 'labelDialog.editFailed' : 'board.labelFailed')}
            </Typography>
          )}
        </DialogContent>
        <Divider />
        <DialogActions>
          <Button variant="text" onClick={onClose}>
            {t('board.cancel')}
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={save.isPending || !trimmed}
          >
            {t(label ? 'board.save' : 'labelDialog.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
