import { Avatar, getInitials, nameToColor } from '@linagora/twake-mui'
import type { ComponentProps, ReactElement } from 'react'

import { displayName } from '@/domain/person'

export function PersonAvatar({
  email,
  name = null,
  avatar = null,
  label,
  size = 24,
  pending = false
}: {
  email: string
  name?: string | null
  avatar?: string | null | undefined
  label?: string
  size?: ComponentProps<typeof Avatar>['size']
  /** Invited, not a member yet: greyed in a stack. */
  pending?: boolean
}): ReactElement {
  return (
    <Avatar
      size={size}
      {...(pending && { className: 'PersonAvatar-pending' })}
      {...(avatar && { src: avatar })}
      color={nameToColor(email) ?? 'sunrise'}
      {...(label
        ? { role: 'img', 'aria-label': label }
        : { 'aria-hidden': true })}
    >
      {getInitials(displayName({ email, name }), email)}
    </Avatar>
  )
}
