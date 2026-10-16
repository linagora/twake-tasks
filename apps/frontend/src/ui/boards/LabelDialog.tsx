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
import { ColorGrid, ColorPreview, ColorPreviewButton } from '@/ds/ColorPicker'
import { DialogHeader } from '@/ds/DialogHeader'
import { labelName, type Label } from '@/domain/board'
import { LABEL_COLORS } from '@/domain/labelColors'
import { useBoardChange } from '@/ui/boards/queries'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'

type Draft = Pick<Label, 'name' | 'color'>

/**
 * A label's name and color, made as a space is in Twake Space: the name
 * beside a preview, which opens the choice of color.
 */
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
  const nameId = useId()
  const [step, setStep] = useState<'details' | 'color'>('details')
  const [name, setName] = useState(label?.name ?? initialName)
  const [color, setColor] = useState(label?.color ?? null)
  const save = useBoardChange(boardId, (api, draft: Draft) =>
    label
      ? api.editLabel(boardId, label.id, draft)
      : api.createLabel(boardId, draft)
  )
  const taken =
    save.error instanceof ApiError && save.error.code === 'label_taken'
  const trimmed = labelName(name)
  const close = { label: t('labelDialog.close'), onClick: onClose }

  return (
    <Dialog
      open
      onClose={onClose}
      aria-labelledby={titleId}
      size={step === 'color' ? 'small' : 'medium'}
    >
      {step === 'details' ? (
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
            title={t(
              label ? 'labelDialog.editTitle' : 'labelDialog.createTitle'
            )}
            close={close}
          />
          <DialogContent className="u-pb-1-half">
            <Stack
              direction="row"
              spacing={2.5}
              className="u-flex-items-center"
            >
              <ColorPreviewButton
                name={trimmed}
                color={color}
                label={t('labelDialog.pickColor')}
                onClick={() => {
                  setStep('color')
                }}
              />
              <Stack spacing={1} className="u-flex-grow-1">
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
      ) : (
        <ColorStep
          titleId={titleId}
          name={trimmed}
          color={color}
          close={close}
          onBack={() => {
            setStep('details')
          }}
          onApply={picked => {
            setColor(picked)
            setStep('details')
          }}
        />
      )}
    </Dialog>
  )
}

function ColorStep({
  titleId,
  name,
  color,
  close,
  onBack,
  onApply
}: {
  titleId: string
  name: string
  color: string | null
  close: { label: string; onClick: () => void }
  onBack: () => void
  onApply: (color: string | null) => void
}): ReactElement {
  const { t } = useI18n()
  const [picked, setPicked] = useState(color)

  return (
    <>
      <DialogHeader
        id={titleId}
        title={t('labelDialog.color')}
        back={{ label: t('labelDialog.back'), onClick: onBack }}
        close={close}
      />
      <DialogContent className="u-pb-1-half">
        <Stack spacing={3} className="u-flex-items-center">
          <ColorPreview name={name} color={picked} size={48} />
          <Typography>{t('labelDialog.colorHint')}</Typography>
          <ColorGrid
            label={t('labelDialog.color')}
            none={t('labelDialog.noColor')}
            swatches={LABEL_COLORS.map(swatch => ({
              value: swatch.value,
              label: t(`labelColors.${swatch.name}`)
            }))}
            value={picked}
            onChange={setPicked}
          />
        </Stack>
      </DialogContent>
      <Divider />
      <DialogActions>
        <Button variant="outlined" onClick={onBack}>
          {t('board.cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={() => {
            onApply(picked)
          }}
        >
          {t('labelDialog.apply')}
        </Button>
      </DialogActions>
    </>
  )
}
