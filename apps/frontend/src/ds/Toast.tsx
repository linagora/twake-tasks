import { Snackbar, styled } from '@linagora/twake-mui'

// Phones keep the bottom bar uncovered.
export const Toast = styled(Snackbar)(({ theme }) => ({
  [theme.breakpoints.down('lg')]: {
    bottom: `calc(var(--sidebarHeight, 0px) + ${theme.spacing(1)})`
  }
}))
