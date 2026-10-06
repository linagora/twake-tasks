import { Avatar, getInitials, nameToColor } from '@linagora/twake-mui'
import type { ReactElement } from 'react'

import { displayName } from '@/domain/person'

export function PersonAvatar({
  email,
  name = null,
  label,
  size = 24
}: {
  email: string
  name?: string | null
  label?: string
  size?: number
}): ReactElement {
  return (
    <Avatar
      size={size}
      color={nameToColor(email) ?? 'sunrise'}
      {...(label
        ? { role: 'img', 'aria-label': label }
        : { 'aria-hidden': true })}
    >
      {getInitials(displayName({ email, name }), email)}
    </Avatar>
  )
}
