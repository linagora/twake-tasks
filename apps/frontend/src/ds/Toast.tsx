import { capitalize, Snackbar, styled } from '@linagora/twake-mui'

// twake-mui's alert severities; `primary` is the default one.
const SEVERITIES = [
  'primary',
  'secondary',
  'success',
  'info',
  'warning',
  'error'
] as const

/** The bottom of a phone screen that is free of its home indicator. */
export const PHONE_BOTTOM = 'env(safe-area-inset-bottom, 0px)'

/** The room a phone screen keeps at its bottom for its floating button. */
export const FAB_ROOM = '--fabRoom'

// Above the floating button of phones. An alert's tint is see-through and a
// toast sits over the page, so the tint is mixed into the paper instead.
export const Toast = styled(Snackbar)(({ theme }) => ({
  [theme.breakpoints.down('lg')]: {
    bottom: `calc(var(${FAB_ROOM}, 0px) + ${PHONE_BOTTOM} + ${theme.spacing(1)})`
  },
  '& .MuiAlert-standard': { boxShadow: theme.vars.shadows[6] },
  ...Object.fromEntries(
    SEVERITIES.map(severity => [
      `& .MuiAlert-standard.MuiAlert-color${capitalize(severity)}`,
      {
        backgroundColor: `color-mix(in srgb, ${theme.vars.palette[severity].main} 12%, ${theme.vars.palette.background.paper})`,
        ...theme.applyStyles('dark', {
          backgroundColor: `color-mix(in srgb, ${theme.vars.palette[severity].main} 24%, ${theme.vars.palette.background.paper})`
        })
      }
    ])
  )
}))
