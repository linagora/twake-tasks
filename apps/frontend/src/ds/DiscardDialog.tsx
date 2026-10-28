import { Button, Dialog, DialogActions, DialogTitle } from '@linagora/twake-mui'
import { useId, type ReactElement } from 'react'

export function DiscardDialog({
  labels,
  onKeep,
  onDiscard
}: {
  labels: { title: string; keep: string; discard: string }
  onKeep: () => void
  onDiscard: () => void
}): ReactElement {
  const titleId = useId()
  return (
    <Dialog open onClose={onKeep} aria-labelledby={titleId} size="small">
      <DialogTitle id={titleId}>{labels.title}</DialogTitle>
      <DialogActions>
        <Button variant="text" onClick={onKeep}>
          {labels.keep}
        </Button>
        <Button onClick={onDiscard}>{labels.discard}</Button>
      </DialogActions>
    </Dialog>
  )
}
