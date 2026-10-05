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
import Markdown from 'react-markdown'

import { ApiError } from '@/application/boards'
import type { Task } from '@/domain/board'
import { useDescription, useSetDescription } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

export function TaskPanel({
  task,
  boardId,
  editable,
  onClose
}: {
  task: Task
  boardId: string
  editable: boolean
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const description = useDescription(boardId, task.id)
  const save = useSetDescription(boardId, task.id)
  const [draft, setDraft] = useState<string | null>(null)
  const stale =
    save.error instanceof ApiError && save.error.code === 'stale_version'

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="medium">
      <DialogTitle id={titleId}>{`${task.key} ${task.title}`}</DialogTitle>
      <DialogContent>
        {description.isError && (
          <Typography role="alert">{t('task.loadFailed')}</Typography>
        )}
        {description.data && draft === null && (
          <>
            <Markdown>{description.data.markdown}</Markdown>
            {editable && (
              <Button
                variant="text"
                onClick={() => {
                  setDraft(description.data.markdown)
                }}
              >
                {t('task.editDescription')}
              </Button>
            )}
          </>
        )}
        {description.data && draft !== null && (
          <form
            id={`${titleId}-form`}
            onSubmit={event => {
              event.preventDefault()
              save.mutate(
                { markdown: draft, version: description.data.version },
                {
                  onSuccess: () => {
                    setDraft(null)
                  }
                }
              )
            }}
          >
            <TextField
              label={t('task.description')}
              value={draft}
              onChange={event => {
                setDraft(event.target.value)
              }}
              multiline
              minRows={6}
              fullWidth
              margin="dense"
              slotProps={{ htmlInput: { maxLength: 50_000 } }}
            />
            {save.isError && (
              <Typography role="alert">
                {stale ? t('task.stale') : t('task.saveFailed')}
              </Typography>
            )}
          </form>
        )}
      </DialogContent>
      {draft !== null && (
        <DialogActions>
          <Button
            variant="text"
            onClick={() => {
              save.reset()
              setDraft(null)
            }}
          >
            {t('board.cancel')}
          </Button>
          <Button
            type="submit"
            form={`${titleId}-form`}
            disabled={save.isPending}
          >
            {t('board.save')}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  )
}
