import {
  Box,
  Button,
  ButtonBase,
  styled,
  ToggleButtonGroup,
  Typography,
  type Theme
} from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

// The toggle shown told by a line and a weight, not by its ground alone
const markedInHighContrast = (theme: Theme) => ({
  'html[data-contrast="high"] && .MuiToggleButton-root.Mui-selected': {
    color: theme.vars.palette.primary.main,
    boxShadow: `inset 0 0 0 2px ${theme.vars.palette.primary.main}`,
    fontWeight: 600
  }
})

// Same height as the buttons it sits next to. The selected button is grey
// like the current entry of the sidebar, where twake-mui greys the others.
export const HeaderToggleGroup = styled(ToggleButtonGroup)(({ theme }) => ({
  '& .MuiToggleButton-root': {
    height: 40,
    padding: theme.spacing(0, 1),
    textTransform: 'none',
    [theme.breakpoints.up('sm')]: { padding: theme.spacing(0, 1.5) }
  },
  '& .MuiToggleButton-root:not(.Mui-selected)': {
    backgroundColor: 'transparent',
    '&:hover': { backgroundColor: theme.vars.palette.action.hover }
  },
  '& .MuiToggleButton-root.Mui-selected': {
    color: theme.vars.palette.primary.main,
    backgroundColor: theme.vars.palette.action.selected,
    '&:hover': { backgroundColor: theme.vars.palette.action.focus }
  },
  ...markedInHighContrast(theme)
}))

// Icons alone, as the list and grid switch of Twake Drive: the one shown on
// a grey ground, the others paler. twake-mui does the reverse, greying the
// others and colouring the icon shown, hence the doubled class.
export const ViewToggleGroup = styled(ToggleButtonGroup)(({ theme }) => ({
  gap: theme.spacing(1.5),
  '&& .MuiToggleButton-root': {
    height: 30,
    minWidth: 36,
    margin: 0,
    padding: theme.spacing(0, 1.25),
    border: 0,
    borderRadius: 6,
    color: theme.vars.palette.text.secondary,
    backgroundColor: 'transparent',
    '& svg': { color: 'inherit' },
    '&:hover': { backgroundColor: theme.vars.palette.action.hover }
  },
  '&& .MuiToggleButton-root.Mui-selected': {
    color: theme.vars.palette.text.primary,
    backgroundColor: theme.vars.palette.action.selected,
    '&:hover': { backgroundColor: theme.vars.palette.action.focus }
  },
  ...markedInHighContrast(theme)
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
