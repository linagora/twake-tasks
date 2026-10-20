import { CrossMedium, Icon } from '@linagora/twake-icons'
import { Box, IconButton, Typography } from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

/** Title and close on one row, as in the dialogs of Twake Space. */
export function DialogHeader({
  id,
  title,
  close
}: {
  id: string
  title: ReactNode
  close: { label: string; onClick: () => void }
}): ReactElement {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: { xs: 2, md: 4 },
        py: 1
      }}
    >
      <Typography
        id={id}
        variant="h4"
        component="h2"
        sx={{ flex: '1 1 auto', minWidth: 0 }}
      >
        {title}
      </Typography>
      <IconButton
        aria-label={close.label}
        onClick={close.onClick}
        sx={{ color: 'text.secondary' }}
      >
        <Icon icon={CrossMedium} />
      </IconButton>
    </Box>
  )
}
