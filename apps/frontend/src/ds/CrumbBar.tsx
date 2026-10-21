import { Box, styled } from '@linagora/twake-mui'
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

/**
 * A breadcrumb with the page's actions beside it, as a page header did: they
 * go under it when short of room.
 */
export function CrumbRow({
  actions,
  children
}: {
  actions?: ReactNode
  children: ReactNode
}): ReactElement {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: 2,
        rowGap: 1,
        py: actions ? 1 : 0
      }}
    >
      <Box sx={{ flex: '1 1 16rem', minWidth: 0 }}>{children}</Box>
      {actions && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 1
          }}
        >
          {actions}
        </Box>
      )}
    </Box>
  )
}

/** A step before the page, in a breadcrumb that titles it: not bold. */
export const CrumbStep = styled('span')({
  display: 'inline-flex',
  alignItems: 'center',
  fontWeight: 400
})
