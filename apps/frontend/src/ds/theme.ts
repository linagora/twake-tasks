import type { ThemeOptions } from '@mui/material/styles'

const noFocusRipple = { defaultProps: { disableFocusRipple: true } }

// One focus ring for every control in place of MUI's faint focus ripple, and
// a secondary text that reads at 4.5:1 on white and on the grey columns.
// The ring is set on ButtonBase alone: a function override on MenuItem, Tab
// or ListItemButton would replace twake-mui's own instead of merging with it.
export const accessibleTheme: ThemeOptions = {
  colorSchemes: {
    light: {
      // twake-css Grey 900 at 0.75 instead of 0.64
      palette: { text: { secondary: 'rgba(66, 66, 68, 0.75)' } }
    }
  },
  components: {
    MuiButtonBase: {
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
    },
    MuiButton: noFocusRipple,
    MuiIconButton: noFocusRipple,
    MuiToggleButton: noFocusRipple,
    MuiCheckbox: noFocusRipple
  }
}
