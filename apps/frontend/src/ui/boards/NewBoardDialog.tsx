import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  TextField
} from '@linagora/twake-mui'
import { useId, useState, type ReactElement } from 'react'

import { ApiError } from '@/application/boards'
import { ClosableTitle } from '@/ds/ClosableTitle'
import type { Board } from '@/domain/board'
import { useCreateBoard, useKeyPrefixCheck } from '@/ui/queries/boards'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'

function suggestedPrefix(name: string): string {
  return name
    .normalize('NFD')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^[0-9]+/, '')
    .slice(0, 3)
}

export function NewBoardDialog({
  onClose,
  onCreated
}: {
  onClose: () => void
  onCreated: (board: Board) => void
}): ReactElement {
  const { t, lang } = useI18n()
  const titleId = useId()
  const [name, setName] = useState('')
  const [typedPrefix, setTypedPrefix] = useState<string | null>(null)
  const wanted = typedPrefix ?? suggestedPrefix(name)
  const check = useKeyPrefixCheck(wanted)
  const taken = check?.available === false
  // A prefix made from the name gives way to a free one; a typed one is the
  // person's choice, which they swap themselves.
  const proposed = typedPrefix === null && taken ? check.suggestion : null
  const keyPrefix = proposed ?? wanted
  const create = useCreateBoard()

  const error = create.error
  const refused =
    error instanceof ApiError &&
    error.code === 'key_prefix_taken' &&
    create.variables?.keyPrefix === keyPrefix
  const prefixTaken = refused || (typedPrefix !== null && taken)
  const freePrefix =
    prefixTaken && taken && check.suggestion !== keyPrefix
      ? check.suggestion
      : null

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="small">
      <form
        onSubmit={event => {
          event.preventDefault()
          create.mutate(
            { name: name.trim(), keyPrefix, language: lang },
            { onSuccess: onCreated }
          )
        }}
      >
        <ClosableTitle
          id={titleId}
          title={t('newBoard.title')}
          closeLabel={t('newBoard.close')}
          onClose={onClose}
        />
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
            inputRef={focusOnMount}
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            label={t('newBoard.keyPrefix')}
            value={keyPrefix}
            onChange={event => {
              setTypedPrefix(event.target.value.toUpperCase())
              create.reset()
            }}
            required
            fullWidth
            margin="dense"
            error={prefixTaken}
            helperText={
              prefixTaken
                ? t('newBoard.keyPrefixTaken', { prefix: keyPrefix })
                : proposed
                  ? t('newBoard.keyPrefixProposed', {
                      prefix: wanted,
                      suggestion: proposed
                    })
                  : t('newBoard.keyPrefixHelp')
            }
            slotProps={{
              htmlInput: { maxLength: 10, pattern: '[A-Z][A-Z0-9]*' }
            }}
          />
          {freePrefix && (
            <Button
              variant="text"
              size="small"
              onClick={() => {
                setTypedPrefix(freePrefix)
                create.reset()
              }}
            >
              {t('newBoard.useKeyPrefix', { prefix: freePrefix })}
            </Button>
          )}
          {error && !prefixTaken && <p role="alert">{t('newBoard.failed')}</p>}
        </DialogContent>
        <DialogActions>
          <Button type="submit" disabled={create.isPending || !name.trim()}>
            {t('newBoard.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
