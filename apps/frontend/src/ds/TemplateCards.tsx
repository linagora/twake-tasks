import { Plus } from '@linagora/twake-icons'
import { Box, ButtonBase, Typography } from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

import { Icon } from '@/ds/Icon'

const CARD = {
  minWidth: 0,
  minHeight: 64,
  borderRadius: '12px',
  border: 1,
  borderColor: 'divider'
} as const

export function CardGroup({
  label,
  count,
  children
}: {
  label: string
  count: number
  children: ReactNode
}): ReactElement {
  return (
    <Box component="section" aria-label={label} sx={{ '& + &': { mt: 2 } }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1 }}>
        <Typography
          variant="caption"
          component="h3"
          color="textSecondary"
          noWrap
          sx={{ fontWeight: 600, textTransform: 'uppercase', minWidth: 0 }}
        >
          {label}
        </Typography>
        <Typography variant="caption" color="textSecondary">
          {count}
        </Typography>
      </Box>
      <Box
        component="ul"
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(13.75rem, 1fr))',
          gap: 1.5,
          m: 0,
          p: 0,
          listStyle: 'none'
        }}
      >
        {children}
      </Box>
    </Box>
  )
}

export function TemplateCard({
  label,
  title,
  facts,
  menu
}: {
  label: string
  title: ReactNode
  facts: string
  menu?: ReactNode
}): ReactElement {
  return (
    <Box
      component="li"
      aria-label={label}
      sx={{
        ...CARD,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        py: 1.5,
        pl: 1.75,
        pr: menu ? 0.75 : 1.75,
        bgcolor: 'background.paper',
        '&:hover, &:focus-within': { borderColor: 'primary.main' }
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
          component="p"
          sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}
        >
          {title}
        </Typography>
        <Typography
          variant="caption"
          component="p"
          color="textSecondary"
          sx={{ mt: 0.5 }}
        >
          {facts}
        </Typography>
      </Box>
      {menu}
    </Box>
  )
}

export function NewCard({
  label,
  onClick
}: {
  label: string
  onClick: () => void
}): ReactElement {
  return (
    <Box component="li" sx={{ display: 'flex', minWidth: 0 }}>
      <ButtonBase
        onClick={onClick}
        sx={theme => ({
          ...CARD,
          ...theme.typography.body2,
          flex: 1,
          gap: 1,
          px: 1.75,
          borderStyle: 'dashed',
          color: 'primary.main',
          fontWeight: 500,
          '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' }
        })}
      >
        <Icon icon={Plus} size={16} />
        <Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          {label}
        </Box>
      </ButtonBase>
    </Box>
  )
}
