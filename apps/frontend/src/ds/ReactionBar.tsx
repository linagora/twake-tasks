import { Dots, Icon } from '@linagora/twake-icons'
import {
  Box,
  Chip,
  IconButton,
  List,
  ListItem,
  Popover,
  Tooltip,
  Typography
} from '@linagora/twake-mui'
import { useState, type ReactElement, type ReactNode } from 'react'

export interface ReactionChip {
  emoji: string
  count: number
  mine: boolean
  /** Who reacted, by name, for the chip's accessible name. */
  people: string
  /** Who reacted, each with an avatar, shown on hover and in the list. */
  who: ReactionPerson[]
  /** The chip's accessible name. */
  label: string
}

export interface ReactionPerson {
  key: string
  name: string
  avatar: ReactNode
}

// The people who gave a reaction, one a row, each with an avatar.
function PeopleList({ people }: { people: ReactionPerson[] }): ReactElement {
  return (
    <Box
      component="ul"
      sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 0.75 }}
    >
      {people.map(person => (
        <Box
          component="li"
          key={person.key}
          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
        >
          {person.avatar}
          <Typography variant="body2" noWrap>
            {person.name}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

// White, as a card over the comment rather than a dark hint.
const WHITE_TOOLTIP = {
  tooltip: {
    sx: {
      bgcolor: 'background.paper',
      color: 'text.primary',
      boxShadow: 3,
      p: 1.5,
      maxWidth: 280
    }
  },
  arrow: { sx: { color: 'background.paper' } }
} as const

export interface ReactionBarLabels {
  group: string
  /** The button that lists who gave each reaction. */
  who: string
  /** How many more reactions than the chips show. */
  hidden: (count: number) => string
}

// As in Twake Chat: the three most given, then how many more.
const SHOWN = 3

export function ReactionBar({
  reactions,
  labels,
  readOnly,
  onReact
}: {
  reactions: ReactionChip[]
  labels: ReactionBarLabels
  /** Shows the reactions without letting anyone add or take one back. */
  readOnly: boolean
  onReact: (emoji: string, on: boolean) => void
}): ReactElement | null {
  const [whoAnchor, setWhoAnchor] = useState<HTMLElement | null>(null)
  if (reactions.length === 0) return null
  // A stable sort keeps the order they were first given among equal counts.
  const byCount = reactions.toSorted((a, b) => b.count - a.count)
  const hidden = byCount.length - SHOWN

  return (
    <Box
      role="group"
      aria-label={labels.group}
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 0.5,
        mt: 0.5
      }}
    >
      {byCount.slice(0, SHOWN).map(reaction => (
        <Tooltip
          key={reaction.emoji}
          title={<PeopleList people={reaction.who} />}
          slotProps={WHITE_TOOLTIP}
        >
          <Chip
            size="small"
            variant="outlined"
            color={reaction.mine ? 'primary' : 'default'}
            // White, the person's own reaction told by its outline only.
            sx={{ bgcolor: 'background.paper' }}
            label={`${reaction.emoji} ${String(reaction.count)}`}
            aria-label={reaction.label}
            {...(readOnly
              ? {}
              : {
                  'aria-pressed': reaction.mine,
                  onClick: () => {
                    onReact(reaction.emoji, !reaction.mine)
                  }
                })}
          />
        </Tooltip>
      ))}
      {hidden > 0 && (
        <Typography variant="caption" color="textSecondary">
          {labels.hidden(hidden)}
        </Typography>
      )}
      <Tooltip title={labels.who}>
        <IconButton
          size="small"
          aria-label={labels.who}
          aria-haspopup="true"
          aria-expanded={whoAnchor !== null}
          onClick={event => {
            setWhoAnchor(event.currentTarget)
          }}
          sx={{ width: 24, height: 24 }}
        >
          <Icon icon={Dots} size={14} />
        </IconButton>
      </Tooltip>
      <Popover
        open={whoAnchor !== null}
        anchorEl={whoAnchor}
        onClose={() => {
          setWhoAnchor(null)
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <List
          dense
          aria-label={labels.who}
          sx={{ minWidth: 220, maxWidth: 320 }}
        >
          {byCount.map(reaction => (
            <ListItem
              key={reaction.emoji}
              sx={{ gap: 1.5, alignItems: 'flex-start' }}
            >
              <Box component="span" aria-hidden sx={{ fontSize: 18 }}>
                {reaction.emoji}
              </Box>
              <PeopleList people={reaction.who} />
            </ListItem>
          ))}
        </List>
      </Popover>
    </Box>
  )
}
