import { Check, Cross, Icon } from '@linagora/twake-icons'
import { Box, Typography } from '@linagora/twake-mui'
import { useId, type ReactElement } from 'react'

const SIZE = 28

// A native radio group: arrows move the choice and each swatch has a name.
export function ColorSwatches({
  legend,
  swatches,
  noneLabel,
  value,
  onChange
}: {
  legend: string
  swatches: readonly { value: string; label: string }[]
  noneLabel: string
  value: string | null
  onChange: (value: string | null) => void
}): ReactElement {
  const name = useId()
  const options = [{ value: '', label: noneLabel }, ...swatches]
  return (
    <Box component="fieldset" sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
      <Typography component="legend" variant="subtitle2" sx={{ p: 0, mb: 1 }}>
        {legend}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {options.map(option => {
          const checked =
            option.value === ''
              ? value === null
              : value?.toUpperCase() === option.value.toUpperCase()
          return (
            <Box
              key={option.value || 'none'}
              component="label"
              title={option.label}
              sx={theme => ({
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: SIZE,
                height: SIZE,
                flexShrink: 0,
                borderRadius: '50%',
                cursor: 'pointer',
                ...(option.value === ''
                  ? {
                      color: theme.vars.palette.text.secondary,
                      border: `2px solid ${theme.vars.palette.divider}`
                    }
                  : {
                      color: theme.palette.getContrastText(option.value),
                      bgcolor: option.value
                    }),
                boxShadow: checked
                  ? `0 0 0 2px ${theme.vars.palette.background.paper}, 0 0 0 4px ${theme.vars.palette.text.primary}`
                  : 'none',
                '&:has(input:focus-visible)': {
                  outline: `2px solid ${theme.vars.palette.primary.main}`,
                  outlineOffset: 4
                }
              })}
            >
              {option.value === '' ? (
                <Icon icon={Cross} size={14} />
              ) : (
                checked && <Icon icon={Check} size={16} />
              )}
              <Box
                component="input"
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => {
                  onChange(option.value === '' ? null : option.value)
                }}
                aria-label={option.label}
                sx={{
                  position: 'absolute',
                  inset: 0,
                  m: 0,
                  opacity: 0,
                  cursor: 'pointer'
                }}
              />
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
