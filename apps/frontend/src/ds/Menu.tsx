import {
  Menu as MuiMenu,
  Slide,
  type MenuProps,
  type SlideProps
} from '@linagora/twake-mui'
import type { ReactElement } from 'react'

import { useNarrowScreen } from '@/ds/PhoneShell'
import { PHONE_BOTTOM } from '@/ds/Toast'

// The width of the screen, against its bottom edge, clear of the home
// indicator: in reach of the thumb that opened it.
const SHEET = {
  left: 0,
  right: 0,
  bottom: 0,
  width: '100%',
  maxWidth: '100%',
  maxHeight: '80dvh',
  borderRadius: '16px 16px 0 0',
  pb: `calc(${PHONE_BOTTOM} + 8px)`,
  '& .MuiMenuItem-root': { minHeight: 48 }
} as const

function SlideUp(props: SlideProps): ReactElement {
  return <Slide {...props} direction="up" />
}

/** A menu that rises from the bottom of a phone screen, as a bottom sheet. */
export function Menu({ slotProps, ...props }: MenuProps): ReactElement {
  const narrow = useNarrowScreen()
  if (!narrow) return <MuiMenu slotProps={slotProps} {...props} />
  const paper = typeof slotProps?.paper === 'object' ? slotProps.paper : {}
  return (
    <MuiMenu
      {...props}
      anchorReference="none"
      slots={{ transition: SlideUp }}
      slotProps={{
        ...slotProps,
        backdrop: { invisible: false },
        paper: { ...paper, sx: SHEET }
      }}
    />
  )
}
