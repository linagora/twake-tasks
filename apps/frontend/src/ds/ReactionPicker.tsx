import { Icon, Plus } from '@linagora/twake-icons'
import { Box, IconButton, Popover, Tooltip } from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'

import { AddReactionIcon } from '@/ds/AddReactionIcon'
import {
  EmojiPicker,
  type EmojiChoice,
  type EmojiPickerOptions
} from '@/ds/EmojiPicker'

export interface ReactionPickerLabels {
  open: string
  quick: string
  more: string
}

/**
 * The reaction button of Twake Chat: a bar of the usual reactions, and a
 * button that opens every emoji. Picking one of yours takes it back.
 */
export function ReactionPicker({
  quick,
  mine,
  labels,
  picker,
  onReact
}: {
  quick: EmojiChoice[]
  /** The emoji you already gave. */
  mine: ReadonlySet<string>
  labels: ReactionPickerLabels
  picker: EmojiPickerOptions
  onReact: (emoji: string, on: boolean) => void
}): ReactElement {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [everything, setEverything] = useState<HTMLElement | null>(null)
  const handlePick = (emoji: string) => {
    setAnchor(null)
    onReact(emoji, !mine.has(emoji))
  }

  return (
    <>
      <Tooltip title={labels.open}>
        <IconButton
          size="small"
          aria-label={labels.open}
          aria-haspopup="true"
          aria-expanded={anchor !== null}
          onClick={event => {
            setAnchor(event.currentTarget)
          }}
          sx={{ width: 32, height: 32, color: 'text.secondary' }}
        >
          <Icon icon={AddReactionIcon} size={20} />
        </IconButton>
      </Tooltip>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => {
          setAnchor(null)
        }}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        slotProps={{ paper: { sx: { borderRadius: 6 } } }}
      >
        <Box
          role="group"
          aria-label={labels.quick}
          sx={{ display: 'flex', alignItems: 'center', gap: 0.25, p: 0.5 }}
        >
          {quick.map(emoji => (
            <IconButton
              key={emoji.unicode}
              aria-label={emoji.label}
              aria-pressed={mine.has(emoji.unicode)}
              onClick={() => {
                handlePick(emoji.unicode)
              }}
              sx={{
                fontSize: 22,
                width: 40,
                height: 40,
                bgcolor: mine.has(emoji.unicode) ? 'action.selected' : null
              }}
            >
              {emoji.unicode}
            </IconButton>
          ))}
          <Tooltip title={labels.more}>
            <IconButton
              aria-label={labels.more}
              onClick={() => {
                // The grid opens from the reaction button, which stays when the bar closes.
                setEverything(anchor)
                setAnchor(null)
              }}
              sx={{ width: 40, height: 40 }}
            >
              <Icon icon={Plus} />
            </IconButton>
          </Tooltip>
        </Box>
      </Popover>
      <EmojiPicker
        anchor={everything}
        options={picker}
        onPick={emoji => {
          handlePick(emoji.unicode)
        }}
        onClose={() => {
          setEverything(null)
        }}
      />
    </>
  )
}
