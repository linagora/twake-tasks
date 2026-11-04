import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography
} from '@linagora/twake-mui'
import { useId, type ReactElement } from 'react'

/** Asks before something that cannot be undone. */
export function ConfirmDialog({
  labels,
  pending = false,
  error,
  onCancel,
  onConfirm
}: {
  labels: { title: string; text: string; cancel: string; confirm: string }
  pending?: boolean
  error?: string | false | undefined
  onCancel: () => void
  onConfirm: () => void
}): ReactElement {
  const titleId = useId()
  return (
    <Dialog open onClose={onCancel} aria-labelledby={titleId} size="small">
      <DialogTitle id={titleId}>{labels.title}</DialogTitle>
      <DialogContent>
        <Typography>{labels.text}</Typography>
        {error && (
          <Typography role="alert" color="error" className="u-mt-1">
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onCancel}>
          {labels.cancel}
        </Button>
        <Button color="error" disabled={pending} onClick={onConfirm}>
          {labels.confirm}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
