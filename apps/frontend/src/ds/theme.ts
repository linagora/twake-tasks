import type { ThemeOptions } from '@mui/material/styles'

const noFocusRipple = { defaultProps: { disableFocusRipple: true } }

// Forced colours drop backgrounds and shadows: the focus, the current page and
// the pressed toggle keep a line of their own.
const forcedColors = {
  '@media (forced-colors: active)': {
    ':focus-visible, .Mui-focusVisible': {
      outline: '3px solid Highlight',
      outlineOffset: '2px'
    },
    'a[aria-current="page"], [aria-pressed="true"]': {
      border: '2px solid CanvasText'
    },
    '.MuiChip-root, .MuiAvatar-root': { border: '1px solid CanvasText' }
  }
}

// The ring is set on ButtonBase alone: a function override on MenuItem, Tab
// or ListItemButton would replace twake-mui's own instead of merging with it.
const ringOnButtons: NonNullable<ThemeOptions['components']>['MuiButtonBase'] =
  {
    styleOverrides: {
      root: ({ theme }) => ({
        '&.Mui-focusVisible': {
          outline: `2px solid ${theme.vars.palette.primary.main}`,
          outlineOffset: 2,
          // In a menu or a tab strip, a ring outside the box would be cut.
          '&.MuiMenuItem-root, &.MuiListItemButton-root, &.MuiTab-root': {
            outlineOffset: -2
          }
        }
      })
    }
  }

const components: ThemeOptions['components'] = {
  MuiCssBaseline: { styleOverrides: forcedColors },
  MuiButtonBase: ringOnButtons,
  MuiButton: noFocusRipple,
  MuiIconButton: noFocusRipple,
  MuiToggleButton: noFocusRipple,
  MuiCheckbox: noFocusRipple
}

// One focus ring for every control in place of MUI's faint focus ripple, and
// a secondary text that reads at 4.5:1 on white and on the grey columns.
export const accessibleTheme: ThemeOptions = {
  colorSchemes: {
    light: {
      // twake-css Grey 900 at 0.75 instead of 0.64
      palette: { text: { secondary: 'rgba(66, 66, 68, 0.75)' } }
    }
  },
  components
}

const scheme = (colors: {
  text: string
  secondary: string
  primary: string
  onPrimary: string
  error: string
  success: string
  warning: string
  info: string
  border: string
}) => ({
  text: { primary: colors.text, secondary: colors.secondary },
  primary: {
    main: colors.primary,
    dark: colors.primary,
    contrastText: colors.onPrimary
  },
  error: { main: colors.error, dark: colors.error },
  success: { main: colors.success, dark: colors.success },
  warning: { main: colors.warning, dark: colors.warning },
  info: { main: colors.info, dark: colors.info },
  border: { main: colors.border },
  divider: colors.border
})

// Every text at 4.5:1 or more and every boundary at 3:1 or more, on white and
// on the grey columns, or on #121212 in the dark scheme.
export const highContrastTheme: ThemeOptions = {
  colorSchemes: {
    light: {
      palette: scheme({
        text: '#1B1B1F',
        secondary: '#3D3D42',
        primary: '#0047A3',
        onPrimary: '#FFFFFF',
        error: '#B00020',
        success: '#1B6B2F',
        warning: '#7A4100',
        info: '#005A8C',
        border: '#595959'
      })
    },
    dark: {
      palette: {
        ...scheme({
          text: '#FFFFFF',
          secondary: '#D6D6D6',
          primary: '#8CB4FF',
          onPrimary: '#121212',
          error: '#FF8A8A',
          success: '#8FD19E',
          warning: '#FFC870',
          info: '#8AD4FF',
          border: '#A0A0A0'
        }),
        background: { default: '#121212', paper: '#121212' }
      }
    }
  },
  components: {
    ...components,
    MuiCssBaseline: {
      styleOverrides: {
        ...forcedColors,
        // Over every ring the components draw, whatever their own colour and
        // width; one turned off stays off.
        ':focus-visible, .Mui-focusVisible': {
          outlineWidth: '3px !important',
          outlineColor: 'var(--twake-palette-text-primary) !important'
        }
      }
    },
    MuiButtonBase: { ...ringOnButtons, defaultProps: { disableRipple: true } },
    MuiLink: { defaultProps: { underline: 'always' } }
  }
}
