import { Box, Breadcrumbs, Link, styled } from '@linagora/twake-mui'
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
  // Twake Drive's title row, on wide screens.
  minHeight: { xs: 56, md: 72 },
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

/** A breadcrumb with the page's actions beside it, or under it when short of room. */
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

/**
 * A breadcrumb on one line: the long names are cut short, the steps before
 * the page first. The origin's icon and the separators stay whole.
 */
export const CrumbTrail = styled(Breadcrumbs)({
  minWidth: 0,
  '& .MuiBreadcrumbs-ol': { flexWrap: 'nowrap' },
  '& .MuiBreadcrumbs-li': { minWidth: '3em', flexShrink: 1e6 },
  '& .MuiBreadcrumbs-li:last-of-type': { minWidth: 0, flexShrink: 1 },
  '& .MuiBreadcrumbs-li:has(> .MuiIconButton-root), & .MuiBreadcrumbs-separator':
    { flexShrink: 0, minWidth: 'auto' }
})

/** A step before the page: not bold, cut short when long. */
export const CrumbStep = styled(Link)({
  display: 'block',
  fontWeight: 400
}) as typeof Link
