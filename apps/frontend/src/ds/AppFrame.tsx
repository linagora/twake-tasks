import { Task } from '@linagora/twake-icons'
import {
  Badge,
  Box,
  Button,
  Content,
  Divider,
  Layout,
  List,
  ListSubheader,
  NavText,
  Sidebar,
  styled,
  Typography
} from '@linagora/twake-mui'
import { useState, type ReactElement, type ReactNode } from 'react'

import { CRUMB_HOST, CrumbHostContext } from '@/ds/CrumbBar'
import { Icon } from '@/ds/Icon'
import {
  MenuContext,
  MenuDrawer,
  useNarrowScreen,
  type MenuControl
} from '@/ds/PhoneShell'
import { PanelHostContext } from '@/ds/SidePanel'
import { FAB_ROOM } from '@/ds/Toast'

export const TOP_BAR_HEIGHT = 64

// Layout forwards `sx` to its div, so it is styled from outside.
const FrameLayout = styled(Layout)(({ theme }) => ({
  flex: '1 1 auto',
  minHeight: 0,
  [theme.breakpoints.down('lg')]: { height: 'auto' }
}))

// Content is `height: 100%` plus a 16px margin on wide screens, which
// overflows the window; stretching it in the flex row keeps the margin inside.
// The content scrolls inside, under the layer an open task takes.
const FrameContent = styled(Content)(({ theme }) => ({
  overflow: 'hidden',
  // Focused only by the skip link, to start the Tab order there.
  '&:focus': { outline: 'none' },
  [theme.breakpoints.up('lg')]: { height: 'auto' }
}))

// Off screen until the keyboard reaches it.
const SKIP_LINK = {
  position: 'absolute',
  left: -10000,
  py: 1,
  px: 2,
  '&:focus': { position: 'fixed', top: 8, left: 8, zIndex: 2100 }
} as const

/** Below lg the sidebar is the `menu` drawer that `MenuButton` opens. */
export function AppFrame({
  topBar,
  sidebar,
  menu,
  fab,
  skipLabel,
  children
}: {
  topBar: ReactNode
  sidebar: ReactNode
  menu: MenuControl
  fab: ReactNode
  skipLabel: string
  children: ReactNode
}): ReactElement {
  const [panelHost, setPanelHost] = useState<HTMLElement | null>(null)
  const [crumbHost, setCrumbHost] = useState<HTMLElement | null>(null)
  const narrow = useNarrowScreen()
  return (
    <CrumbHostContext value={crumbHost}>
      <PanelHostContext value={panelHost}>
        <Box
          sx={{
            height: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            ...(narrow && { [FAB_ROOM]: '88px' })
          }}
        >
          {/* Following #content would push a history entry through the router. */}
          <Button
            href="#content"
            variant="contained"
            sx={SKIP_LINK}
            onClick={event => {
              event.preventDefault()
              document.getElementById('content')?.focus()
            }}
          >
            {skipLabel}
          </Button>
          <MenuContext value={menu}>{topBar}</MenuContext>
          <FrameLayout withTopBar={false}>
            {narrow ? (
              <MenuDrawer menu={menu}>{sidebar}</MenuDrawer>
            ) : (
              <Sidebar>{sidebar}</Sidebar>
            )}
            <FrameContent role={undefined} id="content" tabIndex={-1}>
              <Box ref={setCrumbHost} sx={CRUMB_HOST} />
              {/* Its own stacking context: the raised checkboxes and
                  buttons of the rows stay under an open task. */}
              <Box
                sx={{
                  flex: '1 1 auto',
                  minHeight: 0,
                  overflow: 'auto',
                  isolation: 'isolate',
                  pb: `var(${FAB_ROOM}, 0px)`
                }}
              >
                {children}
              </Box>
              {narrow && fab}
              {/* An open task covers the content, and only it. */}
              <Box
                ref={setPanelHost}
                sx={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  borderRadius: 'inherit',
                  overflow: 'hidden',
                  '& > *': { pointerEvents: 'auto' }
                }}
              />
            </FrameContent>
          </FrameLayout>
        </Box>
      </PanelHostContext>
    </CrumbHostContext>
  )
}

export const EmbedFrame = styled('div')(({ theme }) => ({
  boxSizing: 'border-box',
  padding: 16,
  minHeight: '100dvh',
  backgroundColor: theme.vars.palette.background.paper
}))

export function TopBar({ children }: { children: ReactNode }): ReactElement {
  return (
    <Box
      component="header"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 1, md: 2 },
        flex: '0 0 auto',
        height: TOP_BAR_HEIGHT,
        px: { xs: 2, md: 3 },
        bgcolor: 'background.default'
      }}
    >
      {children}
    </Box>
  )
}

// The brand column lines up with the sidebar below it on wide screens.
export function BrandMark({ name }: { name: string }): ReactElement {
  return (
    <Box
      component="span"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        width: { lg: 204 },
        color: 'primary.main'
      }}
    >
      <Icon icon={Task} size={32} />
      <Typography
        variant="h5"
        component="span"
        color="textPrimary"
        noWrap
        sx={{ display: { xs: 'none', md: 'block' } }}
      >
        {name}
      </Typography>
    </Box>
  )
}

export function TopBarSearch({
  children
}: {
  children: ReactNode
}): ReactElement {
  return (
    // All the room the bar leaves, as Twake Drive's search.
    <Box
      sx={{
        flex: '1 1 auto',
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        '& > :last-child': { flex: '1 1 auto', minWidth: 0 },
        '& input::-webkit-search-cancel-button': { display: 'none' }
      }}
    >
      {children}
    </Box>
  )
}

export function CountBadge({
  count,
  children
}: {
  count: number
  children: ReactNode
}): ReactElement {
  if (count === 0) return <>{children}</>
  // Clear of the 12px right margin of the nav icon.
  return (
    <Badge
      color="error"
      badgeContent={count}
      max={99}
      sx={{ '& .MuiBadge-badge': { right: 12 } }}
    >
      {children}
    </Badge>
  )
}

// The buttons beside a sidebar entry, on one row.
export const NavActions = styled('span')({ display: 'flex' })

// NavText lays its text out as a flex item, which the text's own ellipsis
// needs to be set on.
export const OneLineNavText = styled(NavText)({
  '& > span': {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  }
})

// twake-bar draws the app text logo 22px tall like the Twake wordmark, whose
// box is all capitals. Ours also holds the j's dot and descender: scaled up
// and moved down, its capitals and baseline meet the wordmark's.
export const PlatformBarFrame = styled('div')({
  '& img[src*="project-text"]': { height: 26, transform: 'translateY(3px)' }
})

// The main action above the nav, as wide as its entries.
export const SidebarButton = styled(Button)(({ theme }) => ({
  // As the Create button of Twake Drive.
  margin: '16px 16px 0',
  borderRadius: 12,
  fontSize: theme.typography.pxToRem(14),
  lineHeight: 1.4
}))

// Holds the router link of a sidebar entry, which draws as the entry itself.
export const SidebarEntry = styled('div')(({ theme }) => ({
  display: 'contents',
  '& > a': {
    display: 'flex',
    width: '100%',
    color: 'inherit',
    textDecoration: 'none',
    borderRadius: 8,
    // Inset: the sidebar cuts what spills out of its sides.
    '&:focus-visible': {
      outline: `2px solid ${theme.vars.palette.primary.main}`,
      outlineOffset: -2
    }
  },
  // The current page told by a bar and a weight, not by its colour alone
  'html[data-contrast="high"] & > a[aria-current="page"] > div': {
    backgroundColor: theme.alpha(theme.vars.palette.primary.main, 0.12),
    boxShadow: `inset 4px 0 0 ${theme.vars.palette.primary.main}`,
    fontWeight: 600
  }
}))

export function AccountCard({
  avatar,
  name,
  email
}: {
  avatar: ReactNode
  name: string
  email?: string | undefined
}): ReactElement {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1.5,
        minWidth: 240,
        maxWidth: 320
      }}
    >
      {avatar}
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle1" noWrap>
          {name}
        </Typography>
        {email && (
          <Typography variant="body2" color="textSecondary" noWrap>
            {email}
          </Typography>
        )}
      </Box>
    </Box>
  )
}

export function SidebarSection({
  label,
  children
}: {
  label: string
  children: ReactNode
}): ReactElement {
  return (
    <List
      aria-label={label}
      subheader={
        <ListSubheader component="div" sx={{ bgcolor: 'transparent', px: 3 }}>
          {label}
        </ListSubheader>
      }
      sx={{ py: 0 }}
    >
      {children}
    </List>
  )
}

export function SidebarShelves({
  label,
  children
}: {
  label: string
  children: ReactNode
}): ReactElement {
  return (
    <>
      <Divider sx={{ mx: 2, my: 1 }} />
      <List aria-label={label} sx={{ py: 0 }}>
        {children}
      </List>
    </>
  )
}
