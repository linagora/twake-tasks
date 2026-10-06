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

import { QuickAddError } from '@/application/quickAdd'
import { useQuickAdd } from '@/ui/boards/queries'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'

export function QuickAdd({ onClose }: { onClose: () => void }): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const [line, setLine] = useState('')
  const add = useQuickAdd()

  const error = add.error
  const refusal =
    error instanceof QuickAddError
      ? t(`quickAdd.${error.code}`, { name: error.typed ?? '' })
      : t('quickAdd.failed')

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="medium">
      <form
        onSubmit={event => {
          event.preventDefault()
          add.mutate(line, {
            onSuccess: () => {
              setLine('')
            }
          })
        }}
      >
        <DialogTitle id={titleId}>{t('quickAdd.title')}</DialogTitle>
        <DialogContent>
          <TextField
            label={t('quickAdd.task')}
            value={line}
            onChange={event => {
              setLine(event.target.value)
            }}
            helperText={t('quickAdd.help')}
            fullWidth
            margin="dense"
            inputRef={focusOnMount}
            slotProps={{ htmlInput: { maxLength: 1000 } }}
          />
          {add.isSuccess && (
            <Typography role="status">
              {t('quickAdd.added', { key: add.data.key })}
            </Typography>
          )}
          {add.isError && <Typography role="alert">{refusal}</Typography>}
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={onClose}>
            {t('quickAdd.close')}
          </Button>
          <Button type="submit" disabled={add.isPending || !line.trim()}>
            {t('quickAdd.add')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
