import { Check, CircleFilled } from '@linagora/twake-icons'
import { Box, ButtonBase, Typography, type Theme } from '@linagora/twake-mui'
import { useId, type ReactElement, type ReactNode } from 'react'

import { Icon, type IconProps } from '@/ds/Icon'

// primary.light is a pale blue in both schemes, too bright behind a dark page.
export const tonal = (theme: Theme) => ({
  bgcolor: theme.vars.palette.primary.light,
  ...theme.applyStyles('dark', {
    bgcolor: theme.alpha(theme.vars.palette.primary.main, 0.2)
  })
})

export function SettingsCard({
  id,
  icon,
  title,
  hint,
  aside,
  children
}: {
  id: string
  icon: IconProps['icon']
  title: string
  hint: string
  /** At the right of the title: a status or the section's main action. */
  aside?: ReactNode
  children: ReactNode
}): ReactElement {
  const headingId = useId()
  return (
    <Box
      component="section"
      id={id}
      aria-labelledby={headingId}
      // Focused when picked from the menu, so Tab goes on from there.
      tabIndex={-1}
      sx={theme => ({
        // Clear of the row of chips that stays above it on a phone
        scrollMarginTop: theme.spacing(8),
        [theme.breakpoints.up('md')]: { scrollMarginTop: theme.spacing(2) },
        '&:focus': { outline: 'none' },
        bgcolor: 'background.paper',
        borderRadius: '14px',
        boxShadow: theme.vars.shadows[1],
        px: { xs: 2, sm: 2.5 },
        py: 2.25,
        ...theme.applyStyles('dark', {
          boxShadow: 'none',
          outline: `1px solid ${theme.vars.palette.divider}`
        })
      })}
    >
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: 1.5,
          rowGap: 1,
          mb: 1.5
        }}
      >
        <Box
          aria-hidden
          sx={[
            {
              width: 36,
              height: 36,
              borderRadius: '10px',
              flexShrink: 0,
              display: 'grid',
              placeItems: 'center',
              color: 'primary.main'
            },
            tonal
          ]}
        >
          <Icon icon={icon} size={18} />
        </Box>
        <Box sx={{ flex: '1 1 12rem', minWidth: 0 }}>
          <Typography
            id={headingId}
            variant="h6"
            component="h2"
            sx={{ fontSize: 16, fontWeight: 600 }}
          >
            {title}
          </Typography>
          <Typography variant="caption" color="textSecondary" component="p">
            {hint}
          </Typography>
        </Box>
        {aside}
      </Box>
      {children}
    </Box>
  )
}

/** A short word in green saying the setting is on, such as "Active". */
export function StatusChip({ label }: { label: string }): ReactElement {
  return (
    <Box
      component="span"
      sx={theme => ({
        ...theme.typography.caption,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1.25,
        py: 0.25,
        borderRadius: 100,
        whiteSpace: 'nowrap',
        color: theme.vars.palette.success.dark,
        bgcolor: theme.alpha(theme.vars.palette.success.main, 0.12),
        ...theme.applyStyles('dark', {
          color: theme.vars.palette.success.main
        })
      })}
    >
      <Icon icon={CircleFilled} size={8} />
      {label}
    </Box>
  )
}

export function ToggleChips({
  children
}: {
  children: ReactNode
}): ReactElement {
  return <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>{children}</Box>
}

export function ToggleChip({
  label,
  name,
  pressed,
  disabled = false,
  onClick
}: {
  label: string
  /** Says what it turns on, where the label alone would not. */
  name: string
  pressed: boolean
  disabled?: boolean
  onClick: () => void
}): ReactElement {
  return (
    <ButtonBase
      aria-pressed={pressed}
      aria-label={name}
      disabled={disabled}
      onClick={onClick}
      sx={[
        theme => ({
          ...theme.typography.body2,
          gap: 0.75,
          minHeight: 32,
          px: 1.5,
          borderRadius: 100,
          border: 1,
          borderColor: 'divider',
          color: 'text.secondary',
          whiteSpace: 'nowrap',
          transition: 'background-color 120ms',
          '&.Mui-disabled': { opacity: 0.5 }
        }),
        !pressed && { '&:hover': { bgcolor: 'action.hover' } },
        pressed && {
          borderColor: 'transparent',
          color: 'text.primary',
          fontWeight: 500
        },
        pressed && tonal
      ]}
    >
      {pressed && (
        <Box component="span" sx={{ display: 'flex', color: 'primary.main' }}>
          <Icon icon={Check} size={14} />
        </Box>
      )}
      {label}
    </ButtonBase>
  )
}
