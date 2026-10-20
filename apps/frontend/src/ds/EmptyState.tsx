import { Icon, type IconProps } from '@linagora/twake-icons'
import {
  Box,
  Empty,
  ListSkeleton as TwakeListSkeleton
} from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

export function EmptyState({
  icon,
  title,
  text,
  action,
  compact = false,
  illustrated = false,
  tone = 'default'
}: {
  icon: IconProps['icon']
  title: string
  text?: string
  action?: ReactNode
  compact?: boolean
  illustrated?: boolean
  tone?: 'default' | 'error'
}): ReactElement {
  const badge = illustrated ? 160 : compact ? 40 : 64
  return (
    <Empty
      role={tone === 'error' ? 'alert' : 'status'}
      icon={
        <Box
          aria-hidden
          sx={{
            width: badge,
            height: badge,
            borderRadius: illustrated ? '33%' : '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: illustrated ? 'action.selected' : 'action.hover',
            color: illustrated
              ? 'common.white'
              : tone === 'error'
                ? 'error.main'
                : 'primary.main',
            '& svg': illustrated
              ? { filter: 'drop-shadow(0 2px 10px rgb(0 0 0 / 10%))' }
              : undefined
          }}
        >
          <Icon icon={icon} size={illustrated ? 100 : compact ? 18 : 28} />
        </Box>
      }
      title={title}
      text={text}
      componentsProps={{
        title: { variant: compact ? 'body2' : 'h5', component: 'p' },
        text: { variant: compact ? 'caption' : 'body2', component: 'p' }
      }}
      // Empty sizes itself for its own padding, so ours must not add to it.
      sx={{
        boxSizing: 'border-box',
        width: '100%',
        p: compact ? 2 : { xs: 2, sm: 6 },
        '& .Empty-icon': {
          display: 'flex',
          height: badge,
          mb: illustrated ? 5 : compact ? 1 : 2
        }
      }}
    >
      {action && <Box sx={{ mt: 2 }}>{action}</Box>}
    </Empty>
  )
}

/** Twake's list placeholder, named for those who cannot see it. */
export function ListSkeleton({
  label,
  rows = 4
}: {
  label: string
  rows?: number
}): ReactElement {
  return (
    <Box role="progressbar" aria-label={label}>
      <TwakeListSkeleton count={rows} hasSecondary />
    </Box>
  )
}
