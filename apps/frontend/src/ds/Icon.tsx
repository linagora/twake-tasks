// eslint-disable-next-line no-restricted-imports -- the one place that wraps it
import { Icon as TwakeIcon, type IconProps } from '@linagora/twake-icons'
import type { ReactElement } from 'react'

export type { IconProps }

// Most icons sit beside a text that already says what they mean. A caller
// whose icon stands alone passes aria-hidden={false} and an aria-label.
export function Icon(props: IconProps): ReactElement | null {
  return <TwakeIcon aria-hidden {...props} />
}
