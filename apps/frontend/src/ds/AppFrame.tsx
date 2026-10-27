import { Bottom, Icon, Right, Task } from '@linagora/twake-icons'
import {
  Badge,
  Box,
  Button,
  ButtonBase,
  type ButtonProps,
  Content,
  Divider,
  Layout,
  List,
  ListSubheader,
  NavIcon,
  NavItem,
  NavLink,
  NavText,
  Sidebar,
  styled,
  Typography,
  type Theme
} from '@linagora/twake-mui'
import {
  useState,
  type ElementType,
  type ReactElement,
  type ReactNode,
  type Ref
} from 'react'

import { CRUMB_BAR, CrumbHostContext } from '@/ds/CrumbBar'
import { PanelHostContext } from '@/ds/SidePanel'

export const TOP_BAR_HEIGHT = 64

// Layout forwards `sx` to its div, so it is styled from outside.
const FrameLayout = styled(Layout)(({ theme }) => ({
  flex: '1 1 auto',
  minHeight: 0,
  [theme.breakpoints.down('lg')]: {
    height: 'auto',
    paddingBottom: 'var(--sidebarHeight)'
  }
}))

// Content is `height: 100%` plus a 16px margin on wide screens, which
// overflows the window; stretching it in the flex row keeps the margin inside.
// The content scrolls inside, under the layer an open task takes.
const FrameContent = styled(Content)(({ theme }) => ({
  overflow: 'hidden',
  [theme.breakpoints.up('lg')]: { height: 'auto' }
}))

export function AppFrame({
  topBar,
  sidebar,
  children
}: {
  topBar: ReactNode
  sidebar: ReactNode
  children: ReactNode
}): ReactElement {
  const [panelHost, setPanelHost] = useState<HTMLElement | null>(null)
  const [crumbHost, setCrumbHost] = useState<HTMLElement | null>(null)
  return (
    <CrumbHostContext value={crumbHost}>
      <PanelHostContext value={panelHost}>
        <Box
          sx={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}
        >
          {topBar}
          <FrameLayout withTopBar={false}>
            <Sidebar>{sidebar}</Sidebar>
            <FrameContent role={undefined}>
              {/* A page with no breadcrumb leaves no empty strip above it. */}
              <Box
                ref={setCrumbHost}
                sx={{ ...CRUMB_BAR, '&:empty': { display: 'none' } }}
              />
              {/* Its own stacking context: the raised checkboxes and
                  buttons of the rows stay under an open task. */}
              <Box
                sx={{
                  flex: '1 1 auto',
                  minHeight: 0,
                  overflow: 'auto',
                  isolation: 'isolate'
                }}
              >
                {children}
              </Box>
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
      <Icon icon={Task} size={32} aria-hidden />
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
    <Box
      sx={{
        flex: '1 1 auto',
        minWidth: 0,
        maxWidth: 640,
        '& input::-webkit-search-cancel-button': { display: 'none' }
      }}
    >
      {children}
    </Box>
  )
}

export function TopBarSpacer(): ReactElement {
  return <Box sx={{ flex: '1 1 0', display: { xs: 'none', md: 'block' } }} />
}

export function CountBadge({
  count,
  children
}: {
  count: number
  children: ReactNode
}): ReactElement {
  if (count === 0) return <>{children}</>
  // The nav icon carries a 12px right margin on wide screens, none on phones.
  return (
    <Badge
      color="error"
      badgeContent={count}
      max={99}
      sx={(theme: Theme) => ({
        '& .MuiBadge-badge': {
          right: 12,
          [theme.breakpoints.down('lg')]: { right: 0 }
        }
      })}
    >
      {children}
    </Badge>
  )
}

// twake-mui sizes a bottom bar entry to its label, so five of them overflow a
// 360px screen; sharing the bar between them keeps the labels inside.
export const BarNavItem = styled(NavItem)(({ theme }) => ({
  [theme.breakpoints.down('lg')]: {
    flex: '1 1 0',
    minWidth: 0,
    margin: 0,
    '& a > div > span:not(.MuiBadge-root)': {
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }
}))

// The phone bottom bar has room for five entries.
export const WideScreenNavItem = styled(BarNavItem)(({ theme }) => ({
  [theme.breakpoints.down('lg')]: { display: 'none' }
}))

// An action beside a sidebar entry, which the phone bottom bar has no room for.
export const WideScreenAction = styled('span')(({ theme }) => ({
  display: 'flex',
  [theme.breakpoints.down('lg')]: { display: 'none' }
}))

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

// The main action above the nav, as wide as its entries. The sidebar is a
// bottom bar on phones, which has no room for it.
// The focus is back on it once its dialog closes: an outline marks it, as the
// pulsing ripple would linger there.
export const SidebarButton = styled((props: ButtonProps) => (
  <Button disableFocusRipple {...props} />
))(({ theme }) => ({
  // As the Create button of Twake Drive.
  margin: '16px 16px 0',
  borderRadius: 12,
  fontSize: theme.typography.pxToRem(14),
  lineHeight: 1.4,
  '&.Mui-focusVisible': {
    outline: `2px solid ${theme.vars.palette.primary.main}`,
    outlineOffset: 2
  },
  [theme.breakpoints.down('lg')]: { display: 'none' }
}))

// Holds the router link of a sidebar entry, which draws as the entry itself.
export const SidebarEntry = styled('div')(({ theme }) => ({
  display: 'contents',
  '& > a': {
    display: 'flex',
    width: '100%',
    color: 'inherit',
    textDecoration: 'none'
  },
  // The bottom bar greys the entries that are not current, as twake-mui 10.0
  // did; its NavLink now keeps them in the primary text colour.
  [theme.breakpoints.down('lg')]: {
    '& > a:not([aria-current="page"]) > div': {
      color: theme.vars.palette.text.secondary
    }
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

// Phones get the bottom bar only; the section stays on wide screens. Its
// title is small and grey, as Pinned in Twake Space, and folds its entries
// away when clicked, its arrow after it as Folders in Twake Mail.
export function SidebarSection({
  label,
  fold,
  highlighted = false,
  listRef,
  children
}: {
  label: string
  /** Folds its entries away. */
  fold?: { folded: boolean; label: string; onToggle: () => void } | undefined
  /** Something dragged over it would land in it. */
  highlighted?: boolean
  listRef?: Ref<HTMLUListElement> | undefined
  children: ReactNode
}): ReactElement {
  return (
    <List
      ref={listRef}
      aria-label={label}
      subheader={
        <ListSubheader
          component="div"
          sx={{
            bgcolor: 'transparent',
            px: 3,
            pt: 2,
            pb: 1,
            lineHeight: 1,
            typography: 'caption',
            color: 'text.secondary'
          }}
        >
          {fold ? (
            <ButtonBase
              aria-label={fold.label}
              aria-expanded={!fold.folded}
              onClick={fold.onToggle}
              sx={{
                maxWidth: '100%',
                gap: 0.5,
                borderRadius: 1,
                font: 'inherit',
                color: 'inherit',
                '&:hover, &.Mui-focusVisible': { color: 'text.primary' }
              }}
            >
              <span className="u-ellipsis">{label}</span>
              <Icon icon={fold.folded ? Right : Bottom} size={10} aria-hidden />
            </ButtonBase>
          ) : (
            <span className="u-ellipsis">{label}</span>
          )}
        </ListSubheader>
      }
      // Tinted as a board's column a card is dragged over.
      sx={theme => ({
        display: { xs: 'none', lg: 'block' },
        py: 0,
        borderRadius: 2,
        bgcolor: highlighted
          ? theme.alpha(theme.vars.palette.primary.main, 0.08)
          : 'transparent',
        transition: 'background-color 120ms'
      })}
    >
      {!fold?.folded && children}
    </List>
  )
}

// Phones get the bottom bar only, as for SidebarSection.
export function SidebarShelves({
  label,
  children
}: {
  label: string
  children: ReactNode
}): ReactElement {
  return (
    <Box sx={{ display: { xs: 'none', lg: 'block' } }}>
      <Divider sx={{ mx: 2, mt: 2, mb: 1 }} />
      <List aria-label={label} sx={{ py: 0 }}>
        {children}
      </List>
    </Box>
  )
}

// The last entries, held at the bottom of the sidebar while it has room.
// Phones get the bottom bar only, as for SidebarSection.
export function SidebarFooter({
  children
}: {
  children: ReactNode
}): ReactElement {
  return (
    <Box sx={{ display: { xs: 'none', lg: 'block' }, mt: 'auto', py: 2 }}>
      <List sx={{ py: 0 }}>{children}</List>
    </Box>
  )
}

// An entry of a section, in line with its title as under Pinned in Twake
// Space.
export const SidebarSectionEntry = styled(NavItem)(({ theme }) => ({
  [theme.breakpoints.down('lg')]: { display: 'none' }
}))

/**
 * What an empty sidebar section says, in its place: a grey area with a dashed
 * edge, as where to drop a board or view.
 */
export function SidebarHint({ children }: { children: ReactNode }) {
  return (
    <Typography
      component="li"
      variant="caption"
      color="text.secondary"
      sx={{
        display: 'block',
        mx: 2,
        my: 0.5,
        px: 1.5,
        py: 1.5,
        textAlign: 'center',
        bgcolor: 'action.hover',
        border: '1px dashed',
        borderColor: 'divider',
        borderRadius: 2
      }}
    >
      {children}
    </Typography>
  )
}

/**
 * Where a dragged entry would land in a section: the entry itself, faded as
 * the slot a dragged card leaves on a board.
 */
export function SidebarDropSlot({
  icon,
  label
}: {
  icon: ElementType
  label: string
}): ReactElement {
  return (
    <NavItem aria-hidden sx={{ opacity: 0.4, pointerEvents: 'none' }}>
      <NavLink role="presentation" tabIndex={-1}>
        <NavIcon icon={icon} />
        <NavText>{label}</NavText>
      </NavLink>
    </NavItem>
  )
}

/** A sidebar entry under the pointer, while it is dragged. */
export function SidebarDragPreview({
  icon,
  label
}: {
  icon: ElementType
  label: string
}): ReactElement {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1,
        borderRadius: 2,
        bgcolor: 'background.paper',
        boxShadow: 4,
        maxWidth: 240
      }}
    >
      <Icon icon={icon} size={16} />
      <Typography variant="body2" noWrap>
        {label}
      </Typography>
    </Box>
  )
}
