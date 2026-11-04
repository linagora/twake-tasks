import { Cross } from '@linagora/twake-icons'
import {
  Box,
  Button,
  Divider,
  IconButton,
  Paper,
  styled,
  Tooltip,
  Typography
} from '@linagora/twake-mui'
import type {
  ElementType,
  MouseEventHandler,
  ReactElement,
  ReactNode
} from 'react'

import { Icon } from '@/ds/Icon'
import { Toast } from '@/ds/Toast'

const BAR_HEIGHT = '56px'
// Phones fit the actions on a row of their own, under the count.
const PHONE_BAR_HEIGHT = '92px'

/** A toast shown while the bar is, just above it. */
export const ToastAboveBar = styled(Toast)(({ theme }) => ({
  [theme.breakpoints.up('lg')]: {
    bottom: `calc(${theme.spacing(3)} + ${BAR_HEIGHT})`
  },
  [theme.breakpoints.down('lg')]: {
    bottom: `calc(var(--sidebarHeight, 0px) + ${theme.spacing(1)} + ${BAR_HEIGHT})`
  },
  [theme.breakpoints.down('sm')]: {
    bottom: `calc(var(--sidebarHeight, 0px) + ${theme.spacing(1)} + ${PHONE_BAR_HEIGHT})`
  }
}))

/**
 * Pinned at the bottom of the page while tasks are picked, over the phone's
 * bottom bar as a toast is.
 */
export function SelectionBar({
  label,
  count,
  clearLabel,
  onClear,
  children
}: {
  label: string
  count: ReactNode
  clearLabel: string
  onClear: () => void
  children: ReactNode
}): ReactElement {
  return (
    <Paper
      role="toolbar"
      aria-label={label}
      elevation={6}
      sx={theme => ({
        position: 'fixed',
        zIndex: theme.zIndex.appBar,
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: theme.spacing(3),
        [theme.breakpoints.down('lg')]: {
          bottom: `calc(var(--sidebarHeight, 0px) + ${theme.spacing(1)})`
        },
        maxWidth: `calc(100vw - ${theme.spacing(2)})`,
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        py: 0.75,
        pl: 0.75,
        pr: 1.5,
        borderRadius: 100,
        [theme.breakpoints.down('sm')]: {
          flexWrap: 'wrap',
          width: `calc(100vw - ${theme.spacing(2)})`,
          px: 0.75,
          borderRadius: 4
        }
      })}
    >
      <Tooltip title={clearLabel}>
        <IconButton size="small" aria-label={clearLabel} onClick={onClear}>
          <Icon icon={Cross} />
        </IconButton>
      </Tooltip>
      <Typography
        variant="subtitle2"
        role="status"
        sx={{ whiteSpace: 'nowrap', pr: 1 }}
      >
        {count}
      </Typography>
      <Divider
        orientation="vertical"
        flexItem
        sx={{ my: 0.5, mr: 0.5, display: { xs: 'none', sm: 'block' } }}
      />
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          flex: { xs: '1 1 100%', sm: 'none' },
          justifyContent: 'space-between'
        }}
      >
        {children}
      </Box>
    </Paper>
  )
}

/** Below medium screens only the tooltip shows the label. */
export function BarAction({
  icon,
  label,
  onClick,
  disabled = false,
  danger = false,
  expanded
}: {
  icon: ElementType
  label: string
  onClick: MouseEventHandler<HTMLElement>
  disabled?: boolean
  danger?: boolean
  /** For an action that opens a menu. */
  expanded?: boolean
}): ReactElement {
  return (
    <Tooltip title={label}>
      <span>
        <Button
          variant="text"
          size="small"
          color={danger ? 'error' : 'inherit'}
          disabled={disabled}
          aria-label={label}
          {...(expanded !== undefined && {
            'aria-haspopup': 'menu' as const,
            'aria-expanded': expanded
          })}
          onClick={onClick}
          sx={{ minWidth: 0, whiteSpace: 'nowrap', px: { xs: 1, md: 1.25 } }}
        >
          <Icon icon={icon} />
          <Box
            component="span"
            aria-hidden
            sx={{ ml: 1, display: { xs: 'none', md: 'inline' } }}
          >
            {label}
          </Box>
        </Button>
      </span>
    </Tooltip>
  )
}
