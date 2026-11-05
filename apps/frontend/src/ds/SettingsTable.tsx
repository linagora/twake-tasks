import { Box, Typography } from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

import { Icon, type IconProps } from '@/ds/Icon'

const row = {
  display: 'flex',
  alignItems: 'center',
  columnGap: 1.5,
  rowGap: 1,
  py: 1.25,
  '& + &': { borderTop: 1, borderColor: 'divider' }
} as const

export function SettingsRow({
  icon,
  label,
  labelId,
  hint,
  stacked = false,
  children
}: {
  icon?: IconProps['icon']
  label: string
  labelId?: string
  hint?: string | false
  /** The controls take the row's whole width, under the label. */
  stacked?: boolean
  children: ReactNode
}): ReactElement {
  return (
    <Box sx={{ ...row, flexWrap: 'wrap' }}>
      {icon && (
        <Box sx={{ display: 'flex', color: 'text.secondary' }}>
          <Icon icon={icon} size={20} />
        </Box>
      )}
      <Box sx={{ flex: '1 1 10rem', minWidth: 0 }}>
        <Typography id={labelId} variant="body2">
          {label}
        </Typography>
        {hint && (
          <Typography variant="caption" color="textSecondary" component="p">
            {hint}
          </Typography>
        )}
      </Box>
      {stacked ? (
        <Box sx={{ flexBasis: '100%', display: 'grid', gap: 1.5 }}>
          {children}
        </Box>
      ) : (
        children
      )}
    </Box>
  )
}

/** Buttons side by side, wrapping on a narrow screen. */
export function SettingsActions({
  children
}: {
  children: ReactNode
}): ReactElement {
  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>{children}</Box>
  )
}
