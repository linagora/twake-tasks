import {
  Autocomplete,
  Box,
  ListItem,
  ListItemAvatar,
  ListItemText,
  TextField
} from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

export function InviteRow({
  label,
  onSubmit,
  children
}: {
  label: string
  onSubmit: () => void
  children: ReactNode
}): ReactElement {
  return (
    <Box
      component="form"
      aria-label={label}
      onSubmit={event => {
        event.preventDefault()
        onSubmit()
      }}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        '& > .MuiTextField-root, & > .MuiAutocomplete-root': {
          flex: 1,
          minWidth: 0
        },
        '& > :not(.MuiTextField-root, .MuiAutocomplete-root)': {
          flexShrink: 0
        }
      }}
    >
      {children}
    </Box>
  )
}

export interface PersonSuggestion {
  key: string
  /** What picking the person puts in the field. */
  value: string
  label: string
  detail?: string | undefined
  avatar: ReactNode
}

export function PersonCombobox({
  label,
  value,
  onChange,
  suggestions,
  type,
  maxLength
}: {
  label: string
  value: string
  onChange: (value: string) => void
  suggestions: PersonSuggestion[]
  type?: string
  maxLength?: number
}): ReactElement {
  return (
    <Autocomplete<PersonSuggestion, false, false, true>
      freeSolo
      size="small"
      value={null}
      inputValue={value}
      onInputChange={(_event, next) => {
        onChange(next)
      }}
      options={suggestions}
      filterOptions={options => options}
      getOptionLabel={option =>
        typeof option === 'string' ? option : option.value
      }
      renderOption={({ key, ...props }, person) => (
        <ListItem key={key} {...props}>
          <ListItemAvatar sx={{ minWidth: 44 }}>{person.avatar}</ListItemAvatar>
          <ListItemText
            primary={person.label}
            secondary={person.detail}
            slotProps={{
              primary: { noWrap: true },
              secondary: { noWrap: true }
            }}
          />
        </ListItem>
      )}
      slotProps={{
        popper: {
          placement: 'bottom-start',
          sx: { minWidth: 'min(320px, calc(100vw - 32px))' }
        }
      }}
      renderInput={params => (
        <TextField
          {...params}
          label={label}
          type={type}
          slotProps={{
            ...params.slotProps,
            htmlInput: { ...params.slotProps.htmlInput, maxLength }
          }}
        />
      )}
    />
  )
}

export function PersonRow({
  label,
  detail,
  avatar,
  children
}: {
  label: string
  detail?: string | undefined
  avatar: ReactNode
  children: ReactNode
}): ReactElement {
  return (
    <ListItem aria-label={label} gutters="disabled">
      <ListItemAvatar sx={{ minWidth: 44 }}>{avatar}</ListItemAvatar>
      <ListItemText
        primary={label}
        secondary={detail}
        slotProps={{
          primary: { noWrap: true },
          secondary: { noWrap: true }
        }}
      />
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}
      >
        {children}
      </Box>
    </ListItem>
  )
}
