import { Bottom, Right } from '@linagora/twake-icons'
import { Box, Button } from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

import { Icon } from '@/ds/Icon'

/** The completed tasks at the bottom of a column or a list section. */
export function CompletedFold({
  label,
  expanded,
  onToggle,
  list = false,
  children
}: {
  label: string
  expanded: boolean
  onToggle: () => void
  /** Its tasks are list rows, rather than cards. */
  list?: boolean
  children: ReactNode
}): ReactElement {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Button
        variant="text"
        size="small"
        color="inherit"
        aria-expanded={expanded}
        startIcon={<Icon icon={expanded ? Bottom : Right} size={12} />}
        onClick={onToggle}
        sx={{ alignSelf: 'flex-start', color: 'text.secondary' }}
      >
        {label}
      </Button>
      {expanded &&
        (list ? (
          <Box component="ul" aria-label={label} sx={{ m: 0, p: 0 }}>
            {children}
          </Box>
        ) : (
          children
        ))}
    </Box>
  )
}
