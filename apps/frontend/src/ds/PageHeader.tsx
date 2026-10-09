import {
  Box,
  Button,
  ButtonBase,
  styled,
  ToggleButtonGroup,
  Typography
} from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

// Same height as the buttons it sits next to.
export const HeaderToggleGroup = styled(ToggleButtonGroup)(({ theme }) => ({
  '& .MuiToggleButton-root': {
    height: 40,
    padding: theme.spacing(0, 1),
    textTransform: 'none',
    [theme.breakpoints.up('sm')]: { padding: theme.spacing(0, 1.5) }
  }
}))

// Phones show the icon alone; the button keeps its label for screen readers.
export function ToggleLabel({
  children
}: {
  children: ReactNode
}): ReactElement {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{ ml: 1, display: { xs: 'none', sm: 'inline' } }}
    >
      {children}
    </Box>
  )
}

export const PageTitle = styled(Typography)({
  fontWeight: 700
}) as typeof Typography

export function PageHeader({
  back,
  title,
  actions
}: {
  back?: ReactNode
  title: ReactNode
  actions?: ReactNode
}): ReactElement {
  return (
    <Box sx={{ mb: 3 }}>
      {back && <Box sx={{ mb: 1 }}>{back}</Box>}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: 2,
          rowGap: 1.5
        }}
      >
        <Box sx={{ flex: '1 1 16rem', minWidth: 0 }}>{title}</Box>
        {actions && (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 1
            }}
          >
            {actions}
          </Box>
        )}
      </Box>
    </Box>
  )
}

// Looks unavailable but stays focusable, so its tooltip can say why.
export const UnavailableButton = styled(Button)({
  opacity: 0.5,
  cursor: 'default',
  '& .MuiTouchRipple-root': { display: 'none' }
})

export const StackButton = styled(ButtonBase)(({ theme }) => ({
  borderRadius: theme.shape.borderRadius,
  '&:focus-visible': {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: 2
  }
}))
