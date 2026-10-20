import { Icon, Label as LabelIcon } from '@linagora/twake-icons'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  Divider,
  InputAdornment,
  Stack,
  TextField,
  Typography
} from '@linagora/twake-mui'
import { useId, useState, type ReactElement } from 'react'

import { ApiError } from '@/application/boards'
import { ColorField, leastUsedColor } from '@/ds/ColorPicker'
import { DialogHeader } from '@/ds/DialogHeader'
import { labelName, type Label } from '@/domain/board'
import { useBoardChange } from '@/ui/boards/queries'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'

type Draft = Pick<Label, 'name' | 'color'>

/**
 * A label's name and color, as a team is made in the admin panel: the name's
 * field with the square of its color beside it. A new label starts with the
 * swatch the board uses the least.
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
  const [name, setName] = useState(label?.name ?? initialName)
  const [color, setColor] = useState<string | null>(() =>
    label ? label.color : leastUsedColor(usedColors)
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
          <Stack direction="row" spacing={2} className="u-flex-items-start">
            <TextField
              label={t(label ? 'labelDialog.editName' : 'labelDialog.newName')}
              placeholder={t('labelDialog.name')}
              value={name}
              onChange={event => {
                setName(event.target.value)
                save.reset()
              }}
              required
              fullWidth
              inputRef={focusOnMount}
              error={taken}
              helperText={taken && t('board.labelTaken', { name: trimmed })}
              slotProps={{
                inputLabel: { shrink: true, required: false },
                htmlInput: { maxLength: 50 },
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Icon icon={LabelIcon} size={16} />
                    </InputAdornment>
                  )
                }
              }}
            />
            <ColorField
              label={t('labelDialog.pickColor')}
              customLabel={t('labelDialog.customColor')}
              cancelLabel={t('board.cancel')}
              saveLabel={t('board.save')}
              value={color}
              onChange={setColor}
            />
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
