import { Box, Typography } from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

import { Icon, type IconProps } from '@/ds/Icon'

const row = {
  display: 'flex',
  alignItems: 'center',
  columnGap: 2,
  rowGap: 1,
  px: 2,
  py: 1.25,
  '&:not(:last-of-type)': { borderBottom: 1, borderColor: 'divider' }
} as const

// Each column a switch wide, so the headings sit over their switches.
const columns = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 4.5rem)',
  justifyItems: 'center',
  flexShrink: 0,
  ml: 'auto'
} as const

/** Rows of settings, with the headings of their columns of switches if any. */
export function SettingsTable({
  headings,
  children
}: {
  headings?: [string, string]
  children: ReactNode
}): ReactElement {
  return (
    <Box
      sx={{
        maxWidth: 720,
        mb: 4,
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden'
      }}
    >
      {headings && (
        <Box aria-hidden sx={{ ...row, py: 1, bgcolor: 'background.default' }}>
          <Box sx={columns}>
            {headings.map(heading => (
              <Typography key={heading} variant="caption" color="textSecondary">
                {heading}
              </Typography>
            ))}
          </Box>
        </Box>
      )}
      {children}
    </Box>
  )
}

export function SettingsRow({
  icon,
  label,
  labelId,
  hint,
  paired = false,
  stacked = false,
  children
}: {
  icon?: IconProps['icon']
  label: string
  labelId?: string
  hint?: string | false
  /** The controls are the row's two switches, under the headings. */
  paired?: boolean
  /** The controls take the row's whole width, under the label. */
  stacked?: boolean
  children: ReactNode
}): ReactElement {
  return (
    <Box sx={{ ...row, flexWrap: paired ? 'nowrap' : 'wrap' }}>
      {icon && <Icon icon={icon} size={20} />}
      <Box sx={{ flex: paired ? 1 : '1 1 10rem', minWidth: 0 }}>
        <Typography id={labelId} variant="body2">
          {label}
        </Typography>
        {hint && (
          <Typography variant="caption" color="textSecondary" component="p">
            {hint}
          </Typography>
        )}
      </Box>
      {paired ? (
        <Box sx={columns}>{children}</Box>
      ) : stacked ? (
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
