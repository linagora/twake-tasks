import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField
} from '@linagora/twake-mui'
import { useId, useState, type ReactElement } from 'react'

import { ApiError } from '@/application/boards'
import type { Board } from '@/domain/board'
import { useCreateBoard } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

export function NewBoardDialog({
  onClose,
  onCreated
}: {
  onClose: () => void
  onCreated: (board: Board) => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const [name, setName] = useState('')
  const [keyPrefix, setKeyPrefix] = useState('')
  const create = useCreateBoard()

  const error = create.error
  const prefixTaken =
    error instanceof ApiError && error.code === 'key_prefix_taken'

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="small">
      <form
        onSubmit={event => {
          event.preventDefault()
          create.mutate(
            { name: name.trim(), keyPrefix },
            { onSuccess: onCreated }
          )
        }}
      >
        <DialogTitle id={titleId}>{t('newBoard.title')}</DialogTitle>
        <DialogContent>
          <TextField
            label={t('newBoard.name')}
            value={name}
            onChange={event => {
              setName(event.target.value)
            }}
            required
            fullWidth
            margin="dense"
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            label={t('newBoard.keyPrefix')}
            value={keyPrefix}
            onChange={event => {
              setKeyPrefix(event.target.value.toUpperCase())
              create.reset()
            }}
            required
            fullWidth
            margin="dense"
            error={prefixTaken}
            helperText={
              prefixTaken
                ? t('newBoard.keyPrefixTaken', { prefix: keyPrefix })
                : t('newBoard.keyPrefixHelp')
            }
            slotProps={{
              htmlInput: { maxLength: 10, pattern: '[A-Z][A-Z0-9]*' }
            }}
          />
          {error && !prefixTaken && <p role="alert">{t('newBoard.failed')}</p>}
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={onClose}>
            {t('newBoard.cancel')}
          </Button>
          <Button type="submit" disabled={create.isPending || !name.trim()}>
            {t('newBoard.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
