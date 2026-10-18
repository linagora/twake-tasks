import { Icon } from '@linagora/twake-icons'
import { Box, Tooltip, Typography } from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

import type { IconComponent } from '@/ds/viewIcons'

/** Criteria in a wrapping row, each an item of the list. */
export function ChipList({
  label,
  children
}: {
  label: string
  children: ReactNode
}): ReactElement {
  return (
    <Box
      component="ul"
      aria-label={label}
      sx={{
        listStyle: 'none',
        m: 0,
        p: 0,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: 2,
        rowGap: 1
      }}
    >
      {children}
    </Box>
  )
}

/**
 * A criterion: its icon and name in plain words, then its values as chips;
 * `label` says it whole to assistive technologies.
 */
export function CriterionGroup({
  icon,
  name,
  label,
  children
}: {
  icon: IconComponent
  name: string
  label: string
  children: ReactNode
}): ReactElement {
  return (
    <Box
      component="li"
      aria-label={label}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
    >
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          color: 'text.secondary',
          '& svg': { width: 14, height: 14 }
        }}
      >
        <Icon icon={icon} />
      </Box>
      <Typography variant="body2" color="textSecondary" component="span">
        {name}
      </Typography>
      {children}
    </Box>
  )
}

/** A value read only, in very light grey; `more` spells out a count's values. */
export function ReadChip({
  label,
  more
}: {
  label: string
  more?: string
}): ReactElement {
  const chip = (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 20,
        px: 1,
        borderRadius: 10,
        bgcolor: 'action.hover',
        typography: 'caption',
        fontWeight: 500,
        lineHeight: 1,
        whiteSpace: 'nowrap'
      }}
    >
      {label}
    </Box>
  )
  return more ? <Tooltip title={more}>{chip}</Tooltip> : chip
}
