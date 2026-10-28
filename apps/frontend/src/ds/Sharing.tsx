import {
  Bottom,
  CrossCircleOutline,
  RadioChecked,
  RadioUnchecked,
  UserGroup
} from '@linagora/twake-icons'
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  ListItem,
  ListItemAvatar,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useTheme
} from '@linagora/twake-mui'
import {
  useId,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject
} from 'react'

import { Icon } from '@/ds/Icon'
import { MenuHint } from '@/ds/MenuHint'
import type { PersonSuggestion } from '@/ds/PeopleList'

// The share dialog of the Cozy new UI (Figma "Sharing modal confirmed"): the
// people to invite under their title, then the people with access, each a
// row of a name, an email or state, a role and what removes them.

/** A part of the share dialog, under its title. */
export function ShareSection({
  title,
  children
}: {
  title: string
  children: ReactNode
}): ReactElement {
  return (
    <Stack spacing="10px" sx={{ pt: 1 }}>
      <Typography variant="h5">{title}</Typography>
      {children}
    </Stack>
  )
}

/**
 * The people to invite, picked from suggestions or typed, each a chip, with
 * the role they get at the end of the field and the button that sends.
 */
export function InviteField({
  label,
  placeholder,
  chosen,
  onChoose,
  input,
  onInput,
  suggestions,
  toPerson,
  role,
  send,
  inputRef
}: {
  label: string
  placeholder: string
  chosen: PersonSuggestion[]
  onChoose: (chosen: PersonSuggestion[]) => void
  input: string
  onInput: (input: string) => void
  suggestions: PersonSuggestion[]
  /** A person from what was typed, or null when it is no address. */
  toPerson: (typed: string) => PersonSuggestion | null
  role: ReactNode
  send: ReactNode
  inputRef: RefObject<HTMLInputElement | null>
}): ReactElement {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: '11px' }}>
      <Autocomplete<PersonSuggestion, true, false, true>
        multiple
        freeSolo
        sx={{ flex: 1, minWidth: 0 }}
        value={chosen}
        onChange={(_event, next) => {
          const people = next.flatMap(each => {
            const person = typeof each === 'string' ? toPerson(each) : each
            return person ? [person] : []
          })
          onChoose(
            people.filter(
              (person, index) =>
                people.findIndex(other => other.value === person.value) ===
                index
            )
          )
        }}
        inputValue={input}
        onInputChange={(_event, next, reason) => {
          if (reason !== 'reset') onInput(next)
        }}
        options={suggestions}
        filterOptions={options =>
          options.filter(
            option => !chosen.some(each => each.value === option.value)
          )
        }
        getOptionLabel={option =>
          typeof option === 'string' ? option : option.label
        }
        isOptionEqualToValue={(option, value) =>
          option.value === (typeof value === 'string' ? value : value.value)
        }
        renderValue={(_value, getItemProps) =>
          chosen.map((person, index) => {
            const { key, ...props } = getItemProps({ index })
            return (
              <Chip
                key={key}
                variant="outlined"
                size="small"
                avatar={<Box component="span">{person.avatar}</Box>}
                label={person.label}
                {...props}
                // The person's avatar, at the size of the chip's.
                sx={{
                  '& .MuiChip-avatar': {
                    width: 18,
                    height: 18,
                    ml: 0.5,
                    '& .MuiAvatar-root': {
                      width: 18,
                      height: 18,
                      fontSize: 8
                    }
                  }
                }}
              />
            )
          })
        }
        renderOption={({ key, ...props }, person) => (
          <ListItem key={key} {...props}>
            <ListItemAvatar sx={{ minWidth: 48 }}>
              {person.avatar}
            </ListItemAvatar>
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
        renderInput={params => (
          <TextField
            {...params}
            inputRef={inputRef}
            placeholder={chosen.length === 0 ? placeholder : undefined}
            slotProps={{
              ...params.slotProps,
              htmlInput: {
                ...params.slotProps.htmlInput,
                'aria-label': label,
                maxLength: 254
              },
              input: {
                ...params.slotProps.input,
                // The role sits at the end of the field, over its padding.
                sx: {
                  minHeight: 50,
                  borderRadius: '4px',
                  pr: '112px !important'
                },
                endAdornment: (
                  <InputAdornment
                    position="end"
                    sx={{ position: 'absolute', right: 8 }}
                  >
                    {role}
                  </InputAdornment>
                )
              }
            }}
          />
        )}
      />
      <Box sx={{ flexShrink: 0 }}>{send}</Box>
    </Stack>
  )
}

export interface RoleChoice<R extends string> {
  value: R
  label: string
}

/**
 * A role as a text button with a small chevron, which opens the roles as
 * radios. A hint above them says why they are locked.
 */
export function RoleSelect<R extends string>({
  label,
  value,
  roles,
  onChange,
  locked,
  disabled = false
}: {
  label: string
  value: R
  roles: RoleChoice<R>[]
  onChange: (role: R) => void
  /** Why no other role can be picked. */
  locked?: string | undefined
  disabled?: boolean
}): ReactElement {
  const theme = useTheme()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const open = anchor !== null
  const close = () => {
    setAnchor(null)
  }
  const menuId = useId()
  const current = roles.find(role => role.value === value)
  return (
    <>
      <Button
        variant="text"
        color="inherit"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        endIcon={<Icon icon={Bottom} size={11} />}
        onClick={event => {
          setAnchor(event.currentTarget)
        }}
        sx={{
          minWidth: 0,
          px: 1,
          py: 1,
          borderRadius: '100px',
          whiteSpace: 'nowrap',
          typography: 'body2',
          color: 'text.primary',
          '& .MuiButton-endIcon': { ml: '5px', mr: 0 }
        }}
      >
        {current?.label ?? value}
      </Button>
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={open}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 256, borderRadius: '6px' } } }}
      >
        {locked && <MenuHint>{locked}</MenuHint>}
        {roles.map(role => (
          <MenuItem
            key={role.value}
            role="menuitemradio"
            aria-checked={role.value === value}
            disabled={locked !== undefined && role.value !== value}
            onClick={() => {
              close()
              if (role.value !== value) onChange(role.value)
            }}
            sx={{ minHeight: 40 }}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              {/* The list's icon colour would win over the item's. */}
              <Icon
                icon={role.value === value ? RadioChecked : RadioUnchecked}
                color={
                  role.value === value
                    ? theme.vars.palette.primary.main
                    : theme.vars.palette.action.disabled
                }
              />
            </ListItemIcon>
            <ListItemText
              primary={role.label}
              slotProps={{ primary: { variant: 'body1' } }}
            />
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

/**
 * A person with access: their avatar, name and email or state, then their
 * role and what removes them.
 */
export function MemberRow({
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
    <ListItem
      aria-label={label}
      disableGutters
      sx={{ gap: 2, minHeight: 48, px: 2, py: 1 }}
    >
      <ListItemAvatar sx={{ minWidth: 0, display: 'flex' }}>
        {avatar}
      </ListItemAvatar>
      <ListItemText
        sx={{ my: 0 }}
        primary={label}
        secondary={detail}
        slotProps={{
          primary: { variant: 'body1', noWrap: true },
          secondary: {
            variant: 'caption',
            color: 'textSecondary',
            noWrap: true
          }
        }}
      />
      <Stack
        direction="row"
        sx={{ alignItems: 'center', gap: 1, flexShrink: 0 }}
      >
        {children}
      </Stack>
    </ListItem>
  )
}

/** The role of the person signed in, which they cannot change here. */
export function MemberRole({
  children
}: {
  children: ReactNode
}): ReactElement {
  return (
    <Typography variant="subtitle1" color="textSecondary">
      {children}
    </Typography>
  )
}

/** Removes a person, or says why they cannot be. */
export function RemoveMember({
  label,
  why,
  onClick
}: {
  label: string
  /** Why they cannot be removed; the button is then disabled. */
  why?: string | undefined
  onClick: () => void
}): ReactElement {
  return (
    <Tooltip disableInteractive title={why ?? label}>
      {/* A disabled button gets no hover, so its tooltip hangs on a span. */}
      <span>
        <IconButton
          aria-label={label}
          disabled={why !== undefined}
          onClick={onClick}
          sx={{ p: 1, color: 'text.secondary' }}
        >
          <Icon icon={CrossCircleOutline} size={16} />
        </IconButton>
      </span>
    </Tooltip>
  )
}

/** What the list says while only the person signed in has access. */
export function MembersEmpty({
  title,
  subtitle
}: {
  title: string
  subtitle: string
}): ReactElement {
  return (
    <Stack
      sx={theme => ({
        minHeight: 148,
        px: 2,
        py: 3,
        gap: 1,
        borderRadius: '12px',
        bgcolor: theme.alpha(theme.vars.palette.secondary.main, 0.04),
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center'
      })}
    >
      <Box sx={{ color: 'primary.light', display: 'flex' }}>
        <Icon icon={UserGroup} width={59} height={37} />
      </Box>
      <Box>
        <Typography variant="body2">{title}</Typography>
        <Typography variant="caption" color="textSecondary">
          {subtitle}
        </Typography>
      </Box>
    </Stack>
  )
}

/** Rows standing for the people while they load. */
export function MembersLoading(): ReactElement {
  return (
    <Stack aria-hidden>
      {[1, 2, 3].map(row => (
        <ListItem key={row} disableGutters sx={{ gap: 2, px: 2, py: 1 }}>
          <Skeleton variant="circular" width={32} height={32} />
          <ListItemText
            sx={{ my: 0 }}
            primary={<Skeleton width={120} />}
            secondary={<Skeleton width={160} />}
          />
        </ListItem>
      ))}
    </Stack>
  )
}
