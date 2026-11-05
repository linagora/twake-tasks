import { Avatar, Box, nameToColor } from '@linagora/twake-mui'
import type { ReactElement } from 'react'

import { HIGH_CONTRAST_AVATAR, useContrast } from '@/ds/contrast'
import { backdropOf } from '@/ds/Pictures'

export const ICON = {
  width: 36,
  height: 36,
  borderRadius: '10px',
  flexShrink: 0
}

/**
 * A board's picture or color, or for a board without, its initials on a
 * color of the Twake avatars picked from its name.
 */
export function BoardIcon({
  name,
  cover
}: {
  name: string
  cover: string | null
}): ReactElement {
  const { high } = useContrast()
  if (cover) {
    return (
      <Box
        data-testid="board-icon"
        aria-hidden
        sx={{ ...ICON, ...backdropOf(cover) }}
      />
    )
  }
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(word => Array.from(word)[0] ?? '')
    .join('')
    .toUpperCase()
  return (
    <Avatar
      data-testid="board-icon"
      aria-hidden
      variant="rounded"
      size={36}
      color={high ? HIGH_CONTRAST_AVATAR : (nameToColor(name) ?? 'none')}
      sx={{ ...ICON, fontSize: 13, fontWeight: 600 }}
    >
      {initials}
    </Avatar>
  )
}
