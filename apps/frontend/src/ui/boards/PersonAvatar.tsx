import { Avatar, getInitials, nameToColor } from '@linagora/twake-mui'
import type { ComponentProps, ReactElement } from 'react'

import { HIGH_CONTRAST_AVATAR, useContrast } from '@/ds/contrast'
import { displayName } from '@/domain/person'

export function PersonAvatar({
  email,
  name = null,
  avatar = null,
  label,
  size = 24
}: {
  email: string
  name?: string | null
  avatar?: string | null | undefined
  label?: string
  size?: ComponentProps<typeof Avatar>['size']
}): ReactElement {
  const { high } = useContrast()
  return (
    <Avatar
      size={size}
      {...(avatar && { src: avatar })}
      color={high ? HIGH_CONTRAST_AVATAR : (nameToColor(email) ?? 'sunrise')}
      {...(label
        ? { role: 'img', 'aria-label': label }
        : { 'aria-hidden': true })}
    >
      {getInitials(displayName({ email, name }), email)}
    </Avatar>
  )
}
