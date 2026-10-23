import { Snackbar, styled } from '@linagora/twake-mui'

const SEVERITIES = ['success', 'info', 'warning', 'error'] as const

const capitalized = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1)

// Phones keep the bottom bar uncovered. An alert's tint is see-through, which
// a toast lays over the page: it is mixed with the paper instead.
export const Toast = styled(Snackbar)(({ theme }) => ({
  [theme.breakpoints.down('lg')]: {
    bottom: `calc(var(--sidebarHeight, 0px) + ${theme.spacing(1)})`
  },
  ...Object.fromEntries(
    SEVERITIES.map(severity => [
      `& .MuiAlert-standard.MuiAlert-color${capitalized(severity)}`,
      {
        backgroundColor: `color-mix(in srgb, ${theme.vars.palette[severity].main} 12%, ${theme.vars.palette.background.paper})`,
        boxShadow: theme.vars.shadows[6],
        ...theme.applyStyles('dark', {
          backgroundColor: `color-mix(in srgb, ${theme.vars.palette[severity].main} 24%, ${theme.vars.palette.background.paper})`
        })
      }
    ])
  )
}))
