import { Cross } from '@linagora/twake-icons'
import { DialogTitle, IconButton, Tooltip } from '@linagora/twake-mui'
import type { ReactElement } from 'react'

import { Icon } from '@/ds/Icon'

// twake-mui's close pattern: the button sits beside the DialogTitle, not in
// it, since the dialog is named after the title's content.
export function ClosableTitle({
  id,
  title,
  closeLabel,
  onClose
}: {
  id?: string
  title: string
  closeLabel: string
  onClose: () => void
}): ReactElement {
  return (
    <>
      <Tooltip disableInteractive title={closeLabel}>
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
      </Tooltip>
      <DialogTitle id={id} className="dialogTitleWithClose u-ellipsis">
        {title}
      </DialogTitle>
    </>
  )
}
