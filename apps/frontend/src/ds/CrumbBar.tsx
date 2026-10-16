import { Box } from '@linagora/twake-mui'
import {
  createContext,
  useContext,
  type ReactElement,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'

/**
 * The strip of the breadcrumb, at the top of the content: a page puts its
 * breadcrumb there, and an open task its header, at the same height and
 * margins, so that the breadcrumb never jumps.
 */
export const CRUMB_BAR = {
  display: 'flex',
  alignItems: 'center',
  gap: 0.5,
  flex: '0 0 auto',
  minHeight: 56,
  px: { xs: 2, sm: 3 }
} as const

/** The strip the frame holds; null in an embed, where a page has none. */
export const CrumbHostContext = createContext<HTMLElement | null>(null)

/** A page's breadcrumb, in the frame's strip, or in its own one in an embed. */
export function CrumbSlot({ children }: { children: ReactNode }): ReactElement {
  const host = useContext(CrumbHostContext)
  return host ? (
    createPortal(children, host)
  ) : (
    <Box sx={{ ...CRUMB_BAR, px: 0, minHeight: 40 }}>{children}</Box>
  )
}
