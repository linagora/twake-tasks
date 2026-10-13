import { Cross, Icon } from '@linagora/twake-icons'
import { DialogTitle, IconButton } from '@linagora/twake-mui'
import type { ReactElement } from 'react'

// twake-mui's close pattern: the button sits beside the DialogTitle, not in
// it, since the dialog is named after the title's content.
export function ClosableTitle({
  title,
  closeLabel,
  onClose
}: {
  title: string
  closeLabel: string
  onClose: () => void
}): ReactElement {
  return (
    <>
      <IconButton
        aria-label={closeLabel}
        onClick={onClose}
        sx={{
          position: 'absolute',
          top: { xs: '0.25rem', md: '1.15rem' },
          right: { xs: '0.25rem', md: '1.15rem' }
        }}
      >
        <Icon icon={Cross} />
      </IconButton>
      <DialogTitle className="dialogTitleWithClose u-ellipsis">
        {title}
      </DialogTitle>
    </>
  )
}
