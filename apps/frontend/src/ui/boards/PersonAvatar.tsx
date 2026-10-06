import { Avatar, getInitials, nameToColor } from '@linagora/twake-mui'
import type { ReactElement } from 'react'

export function PersonAvatar({
  email,
  label,
  size = 24
}: {
  email: string
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
      {getInitials(email, email)}
    </Avatar>
  )
}
