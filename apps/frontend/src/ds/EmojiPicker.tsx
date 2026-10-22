import {
  Box,
  IconButton,
  InputBase,
  Popover,
  Typography
} from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'

export interface EmojiChoice {
  unicode: string
  label: string
}

export interface EmojiPickerLabels {
  open: string
  search: string
  list: string
  none: string
}

export interface EmojiPickerOptions {
  labels: EmojiPickerLabels
  /** The emoji to show for what was typed; an empty query asks for the usual ones. */
  search: (query: string) => EmojiChoice[]
}

// A stable callback ref: an inline one is re-invoked on every render and steals focus.
const focusOnMount = (input: HTMLInputElement | null): void => {
  input?.focus()
}

export function EmojiPicker({
  anchor,
  options,
  onPick,
  onClose
}: {
  anchor: HTMLElement | null
  options: EmojiPickerOptions
  onPick: (emoji: EmojiChoice) => void
  onClose: () => void
}): ReactElement {
  const [query, setQuery] = useState('')
  const found = options.search(query)
  const handleClose = () => {
    setQuery('')
    onClose()
  }

  return (
    <Popover
      open={anchor !== null}
      anchorEl={anchor}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
    >
      <Box sx={{ p: 1, width: 336, maxWidth: 'calc(100vw - 32px)' }}>
        <InputBase
          inputRef={focusOnMount}
          value={query}
          placeholder={options.labels.search}
          inputProps={{ 'aria-label': options.labels.search, maxLength: 50 }}
          onChange={event => {
            setQuery(event.target.value)
          }}
          sx={{
            px: 1,
            width: '100%',
            border: 1,
            borderColor: 'divider',
            borderRadius: 1
          }}
        />
        {found.length === 0 ? (
          <Typography
            variant="caption"
            color="textSecondary"
            component="p"
            sx={{ pt: 1 }}
          >
            {options.labels.none}
          </Typography>
        ) : (
          <Box
            role="group"
            aria-label={options.labels.list}
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(8, 1fr)',
              pt: 1
            }}
          >
            {found.map(emoji => (
              <IconButton
                key={emoji.unicode}
                size="small"
                aria-label={emoji.label}
                title={emoji.label}
                onClick={() => {
                  onPick(emoji)
                  handleClose()
                }}
                sx={{ fontSize: 20, borderRadius: 1 }}
              >
                {emoji.unicode}
              </IconButton>
            ))}
          </Box>
        )}
      </Box>
    </Popover>
  )
}
