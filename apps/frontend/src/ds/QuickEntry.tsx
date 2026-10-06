import { Box, Paper, Typography } from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

import { Highlight } from '@/ds/Highlight'

export function ParsedParts({
  label,
  children
}: {
  label: string
  children: ReactNode
}): ReactElement {
  return (
    <Box
      component="ul"
      aria-label={label}
      sx={{
        listStyle: 'none',
        m: 0,
        mt: 1,
        p: 0,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 0.75,
        minHeight: 22
      }}
    >
      {children}
    </Box>
  )
}

export function ParsedPart({
  children
}: {
  children: ReactNode
}): ReactElement {
  return (
    <Box component="li" sx={{ display: 'flex', minWidth: 0 }}>
      {children}
    </Box>
  )
}

export function ParsedTitle({
  children
}: {
  children: ReactNode
}): ReactElement {
  return (
    <Typography
      variant="body2"
      noWrap
      sx={{ fontWeight: 500, mr: 0.5, maxWidth: '100%' }}
    >
      {children}
    </Typography>
  )
}

export function SuggestionList({
  id,
  label,
  children
}: {
  id: string
  label: string
  children: ReactNode
}): ReactElement {
  return (
    <Paper
      variant="outlined"
      sx={{ mt: 1, borderRadius: 2, overflow: 'hidden' }}
    >
      <Box
        component="ul"
        id={id}
        role="listbox"
        aria-label={label}
        sx={{ listStyle: 'none', m: 0, p: 0.5 }}
      >
        {children}
      </Box>
    </Paper>
  )
}

export function SuggestionOption({
  id,
  selected,
  onPick,
  primary,
  secondary,
  highlight
}: {
  id: string
  selected: boolean
  onPick: () => void
  primary: string
  secondary?: string | undefined
  highlight: string
}): ReactElement {
  return (
    <Box
      component="li"
      id={id}
      role="option"
      aria-selected={selected}
      // The field keeps the focus, so typing goes on after a click.
      onMouseDown={event => {
        event.preventDefault()
      }}
      onClick={onPick}
      sx={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 1,
        px: 1.5,
        py: 0.75,
        borderRadius: 1,
        cursor: 'pointer',
        bgcolor: selected ? 'action.selected' : undefined,
        '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' }
      }}
    >
      <Typography variant="body2" noWrap>
        <Highlight text={primary} query={highlight} />
      </Typography>
      {secondary && (
        <Typography variant="caption" color="textSecondary" noWrap>
          <Highlight text={secondary} query={highlight} />
        </Typography>
      )}
    </Box>
  )
}

export function SyntaxHelp({
  id,
  lines
}: {
  id: string
  lines: string[]
}): ReactElement {
  return (
    <Box
      component="ul"
      id={id}
      sx={{
        m: 0,
        mt: 1.5,
        p: 1.5,
        pl: 3.5,
        borderRadius: 2,
        bgcolor: 'action.hover',
        typography: 'body2',
        color: 'text.secondary',
        '& li + li': { mt: 0.5 }
      }}
    >
      {lines.map(line => (
        <li key={line}>{line}</li>
      ))}
    </Box>
  )
}
