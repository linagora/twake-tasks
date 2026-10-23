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

// Phones keep the bottom bar uncovered. An alert's tint is see-through, which
// a toast lays over the page: it is mixed with the paper instead.
export const Toast = styled(Snackbar)(({ theme }) => ({
  [theme.breakpoints.down('lg')]: {
    bottom: `calc(var(--sidebarHeight, 0px) + ${theme.spacing(1)})`
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
