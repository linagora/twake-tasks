import { CrossMedium, Icon, Previous } from '@linagora/twake-icons'
import { Box, IconButton, Typography } from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

interface HeaderAction {
  label: string
  onClick: () => void
}

/** Back, title and close on one row, as in the dialogs of Twake Space. */
export function DialogHeader({
  id,
  title,
  back,
  close
}: {
  id: string
  title: ReactNode
  back?: HeaderAction | undefined
  close: HeaderAction
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
      {back && (
        <IconButton aria-label={back.label} onClick={back.onClick}>
          <Icon icon={Previous} />
        </IconButton>
      )}
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
