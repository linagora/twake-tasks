import { Icon, Narrow } from '@linagora/twake-icons'
import {
  Box,
  Drawer,
  IconButton,
  InputBase,
  MenuItem,
  Select,
  styled,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme
} from '@linagora/twake-mui'
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactElement,
  type ReactNode,
  type RefObject,
  type SVGProps
} from 'react'
import { createPortal } from 'react-dom'

import { CRUMB_BAR } from '@/ds/CrumbBar'

function inField(element: Element | null): boolean {
  return element?.matches('input, textarea, [contenteditable]') ?? false
}

/**
 * Where a task opens: the content area of the frame, under the top bar and
 * beside the sidebar, which stay in reach. Without it, as in an embed, the
 * task opens in a drawer.
 */
export const PanelHostContext = createContext<HTMLElement | null>(null)

// The drawer does this itself: the panel takes the focus, and gives it back
// on close to where it was, so a parent's Escape works again after its
// sub-task closes.
function useFocusWhileOpen(
  host: HTMLElement | null
): RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!host) return
    const opener = document.activeElement
    const panel = ref.current
    panel?.focus()
    return () => {
      // Another task clicked beside a peek has the focus, and opens there.
      const now = document.activeElement
      if (now && now !== document.body && !panel?.contains(now)) return
      // Safari focuses no button on click: the panel under it, if any, then.
      const back =
        opener instanceof HTMLElement && opener !== document.body
          ? opener
          : host.lastElementChild
      if (back instanceof HTMLElement) back.focus()
    }
  }, [host])
  return ref
}

const PeekContext = createContext(false)

/** True in a peek, whose header has room for the task's key and icons only. */
export function useInPeek(): boolean {
  return useContext(PeekContext)
}

// The panel's own width decides, not the window's: a drawer stays narrow on
// a wide screen.
const WIDE = '@container (min-width: 960px)'
// Wide enough for a column of labels beside the values.
const ROWS = '@container (min-width: 420px)'
const ASIDE_WIDTH = 'max(280px, 100% / 3)'

const PEEK_WIDTH = 'clamp(480px, 36vw, 560px)'

const CONTROLS =
  'button, a, input, textarea, select, label, [role="button"], [contenteditable]'

function inPeekPanel(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-peek]') !== null
}

/**
 * The page beside a peek stays in use: a click there closes the peek, unless
 * it hits a control (a task there opens in its place), and so does Escape.
 * Unsaved changes stop the click, and the peek asks before it goes. Only the
 * top one of a sub-task's stack listens.
 */
function usePageBesidePeek(
  page: HTMLElement | null | undefined,
  panel: RefObject<HTMLElement | null>,
  onClose: () => void,
  unsaved: () => boolean
): void {
  useEffect(() => {
    if (!page) return
    const top = () =>
      panel.current !== null &&
      panel.current === panel.current.parentElement?.lastElementChild
    // Captured, so that it comes before the page's own handlers.
    const click = (event: MouseEvent) => {
      if (inPeekPanel(event.target) || !top()) return
      if (unsaved()) {
        event.stopPropagation()
        event.preventDefault()
        onClose()
      } else if (!(
        event.target instanceof Element && event.target.closest(CONTROLS)
      )) {
        onClose()
      }
    }
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || inPeekPanel(event.target) || !top()) return
      if (!inField(document.activeElement)) onClose()
    }
    page.addEventListener('click', click, true)
    page.addEventListener('keydown', key)
    return () => {
      page.removeEventListener('click', click, true)
      page.removeEventListener('keydown', key)
    }
  }, [page, panel, onClose, unsaved])
}

// twake-icons has the arrows that narrow, not the ones that widen.
function Widen(props: SVGProps<SVGSVGElement>): ReactElement {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" {...props}>
      <path
        d="M10 1.9h4.1V6m0-4.1L9.6 6.4M6 14.1H1.9V10m0 4.1 4.5-4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * An open task: the content (two thirds) under its header, and a bar of
 * properties (one third) from the top. In a narrow panel, the properties sit
 * between the title and the rest of the content.
 *
 * In the frame, it opens in a peek over the right of the page, which stays
 * in use, or expanded over the whole content. On a phone, both take the whole
 * content.
 */
export function SidePanel({
  label,
  onClose,
  unsaved,
  expanded,
  onExpand,
  expandLabel,
  peekLabel,
  header,
  lead,
  aside,
  children
}: {
  label: string
  onClose: () => void
  /** Whether closing would lose an edit, and so has to ask first. */
  unsaved: () => boolean
  expanded: boolean
  onExpand: (expanded: boolean) => void
  expandLabel: string
  peekLabel: string
  header: ReactNode
  /** The title, and what must be read before it. */
  lead: ReactNode
  aside: ReactNode
  children: ReactNode
}): ReactElement {
  const host = useContext(PanelHostContext)
  const focused = useFocusWhileOpen(host)
  const theme = useTheme()
  const phone = useMediaQuery(theme.breakpoints.down('md'))
  const peek = host !== null && !expanded
  usePageBesidePeek(
    peek && !phone ? host.parentElement : null,
    focused,
    onClose,
    unsaved
  )
  const gutter = { minWidth: 0, px: { xs: 2, sm: 3 } }
  const column = { display: 'flex', flexDirection: 'column', gap: 3 }
  // One reading order for both layouts: a wide panel takes the properties
  // out of the flow into a column of their own, from the top.
  const body = (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        containerType: 'inline-size'
      }}
    >
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          // A sheet over the page scrolls without a bar of its own.
          ...(peek && { scrollbarWidth: 'none' }),
          [WIDE]: { overflowY: 'hidden', mr: ASIDE_WIDTH }
        }}
      >
        {/* Pinned, so Close stays in reach while a narrow panel scrolls. */}
        <Box
          sx={{
            ...CRUMB_BAR,
            borderBottom: 1,
            borderColor: 'divider',
            position: 'sticky',
            top: 0,
            zIndex: 2,
            bgcolor: 'background.paper'
          }}
        >
          {host && (
            <Tooltip title={expanded ? peekLabel : expandLabel}>
              <IconButton
                size="small"
                aria-label={expanded ? peekLabel : expandLabel}
                onClick={() => {
                  onExpand(!expanded)
                }}
                sx={{ display: { xs: 'none', md: 'inline-flex' }, ml: -0.5 }}
              >
                <Icon icon={expanded ? Narrow : Widen} />
              </IconButton>
            </Tooltip>
          )}
          {header}
        </Box>
        <Box sx={{ [WIDE]: { flex: 1, minHeight: 0, overflowY: 'auto' } }}>
          <Box sx={{ ...gutter, ...column, pt: 2 }}>{lead}</Box>
          <Box
            component="aside"
            sx={{
              ...gutter,
              ...column,
              py: 2,
              // As thin and light as the header's line: widths only, since
              // a `border` shorthand in a query resets the colour.
              borderStyle: 'solid',
              borderColor: 'divider',
              borderWidth: '0 0 1px',
              [WIDE]: {
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                width: ASIDE_WIDTH,
                overflowY: 'auto',
                borderWidth: '0 0 0 1px'
              }
            }}
          >
            {aside}
          </Box>
          <Box sx={{ ...gutter, ...column, py: 2, [WIDE]: { pt: 1 } }}>
            {children}
          </Box>
        </Box>
      </Box>
    </Box>
  )

  if (!host) {
    return (
      <Drawer
        open
        anchor="right"
        onClose={(_event, reason) => {
          if (reason === 'escapeKeyDown' && inField(document.activeElement))
            return
          onClose()
        }}
        slotProps={{
          paper: {
            role: 'dialog',
            'aria-label': label,
            'aria-modal': true,
            sx: {
              width: { xs: '100%', sm: 600 },
              display: 'flex',
              flexDirection: 'column'
            }
          }
        }}
      >
        {body}
      </Drawer>
    )
  }
  return createPortal(
    <Box
      ref={focused}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      data-peek={peek ? '' : undefined}
      onKeyDown={event => {
        if (event.key !== 'Escape' || inField(document.activeElement)) return
        event.stopPropagation()
        onClose()
      }}
      sx={{
        position: 'absolute',
        inset: 0,
        ...(peek && {
          left: { md: 'auto' },
          width: { md: PEEK_WIDTH },
          boxShadow: {
            md: '-12px 0 32px rgb(0 0 0 / 0.2), -1px 0 0 rgb(0 0 0 / 0.08)'
          }
        }),
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        outline: 'none'
      }}
    >
      <PeekContext value={peek && !phone}>{body}</PeekContext>
    </Box>,
    host
  )
}

export function Grow(): ReactElement {
  return <Box sx={{ flex: 1 }} />
}

export function Chips({
  label,
  children
}: {
  label: string
  children: ReactNode
}): ReactElement {
  return (
    <Box
      component="ul"
      aria-label={label}
      sx={{
        listStyle: 'none',
        m: 0,
        p: 0,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 0.5,
        '& > li': { display: 'inline-flex', alignItems: 'center' }
      }}
    >
      {children}
    </Box>
  )
}

/** A header action as small as its neighbours, filled once it is on. */
export const HeaderToggle = styled(IconButton, {
  shouldForwardProp: prop => prop !== 'on' && prop !== 'unavailable'
})<{ on: boolean; unavailable: boolean }>(({ theme, on, unavailable }) => ({
  ...(on && {
    '&, &:hover': {
      backgroundColor: theme.vars.palette.success.main,
      color: theme.vars.palette.success.contrastText
    }
  }),
  ...(unavailable && { opacity: 0.5, cursor: 'default' })
}))

export function Inline({ children }: { children: ReactNode }): ReactElement {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      {children}
    </Box>
  )
}

export function PropertySelect({
  labelId,
  value,
  options,
  onChange,
  disabled
}: {
  labelId: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  disabled?: boolean
}): ReactElement {
  return (
    <Select
      size="small"
      disabled={disabled}
      value={value}
      displayEmpty
      SelectDisplayProps={{ 'aria-labelledby': labelId }}
      onChange={event => {
        onChange(event.target.value)
      }}
      sx={theme => ({
        ...theme.typography.body2,
        ml: -1,
        '& .MuiSelect-select': { py: 0.75, pl: 1, minHeight: 'auto' },
        '&, &.Mui-disabled': {
          bgcolor: 'transparent',
          '& .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' }
        },
        '&:hover:not(.Mui-disabled)': { bgcolor: 'action.hover' },
        '&:hover .MuiOutlinedInput-notchedOutline': {
          borderColor: 'transparent'
        }
      })}
    >
      {options.map(option => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </Select>
  )
}

export const TitleInput = styled(InputBase)(({ theme }) => ({
  ...theme.typography.h4,
  width: '100%',
  borderRadius: theme.shape.borderRadius,
  '& textarea': { padding: theme.spacing(0.5, 1) },
  marginLeft: theme.spacing(-1),
  '&:hover': { backgroundColor: theme.vars.palette.action.hover },
  '&.Mui-focused': {
    backgroundColor: 'transparent',
    boxShadow: `inset 0 0 0 2px ${theme.vars.palette.primary.main}`
  }
}))

export function Properties({
  children
}: {
  children: ReactNode
}): ReactElement {
  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))',
        columnGap: 2,
        rowGap: 1,
        [ROWS]: {
          gridTemplateColumns: '8rem 1fr',
          rowGap: 0.5,
          alignItems: 'center'
        }
      }}
    >
      {children}
    </Box>
  )
}

export function Property({
  id,
  icon,
  label,
  children
}: {
  id?: string
  icon: ReactNode
  label: string
  children: ReactNode
}): ReactElement {
  // A phone stacks each label over its value; a wider panel lines the labels
  // up in a column of their own.
  return (
    <Box sx={{ minWidth: 0, [ROWS]: { display: 'contents' } }}>
      <Box
        component="dt"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          color: 'text.secondary',
          '& svg': { width: 16, height: 16, flexShrink: 0 },
          [ROWS]: { minHeight: 40 }
        }}
      >
        {icon}
        <Typography
          id={id}
          variant="caption"
          color="inherit"
          noWrap
          sx={theme => ({ [ROWS]: theme.typography.body2 })}
        >
          {label}
        </Typography>
      </Box>
      <Box
        component="dd"
        sx={{
          m: 0,
          minWidth: 0,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1,
          minHeight: 40
        }}
      >
        {children}
      </Box>
    </Box>
  )
}

export function Feed({
  label,
  children
}: {
  label: string
  children: ReactNode
}): ReactElement {
  return (
    <Box
      component="ul"
      aria-label={label}
      sx={{
        listStyle: 'none',
        m: 0,
        p: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 2
      }}
    >
      {children}
    </Box>
  )
}

export function FeedItem({
  avatar,
  label,
  actions,
  children
}: {
  avatar: ReactNode
  label?: string
  /** Shown at the item's end while it is hovered or focused. */
  actions?: ReactNode
  children: ReactNode
}): ReactElement {
  return (
    <Box
      component="li"
      aria-label={label}
      sx={{
        display: 'flex',
        gap: 1.5,
        alignItems: 'flex-start',
        '& .feed-actions': { opacity: 0 },
        '&:hover .feed-actions, &:focus-within .feed-actions': {
          opacity: 1
        },
        // Nothing hovers on a touch screen.
        '@media (hover: none)': { '& .feed-actions': { opacity: 1 } }
      }}
    >
      <Box sx={{ pt: 0.25 }}>{avatar}</Box>
      <Box sx={{ minWidth: 0, flex: 1, '& p': { my: 0.5 } }}>{children}</Box>
      {actions && (
        <Box
          className="feed-actions"
          sx={theme => ({
            flex: 'none',
            display: 'flex',
            mt: -0.5,
            transition: theme.transitions.create('opacity')
          })}
        >
          {actions}
        </Box>
      )}
    </Box>
  )
}

export function PanelSection({
  title,
  hideTitle = false,
  action,
  children
}: {
  title: string
  /** Kept for screen readers only, when the content speaks for itself. */
  hideTitle?: boolean
  action?: ReactNode
  children: ReactNode
}): ReactElement {
  return (
    <Box component="section" aria-label={title} sx={{ display: 'flow-root' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 1,
          // Without its title, the action floats beside the content rather
          // than taking a line over it, raised over the content: ProseMirror
          // positions its text, which would paint over the float and take
          // its clicks.
          ...(hideTitle
            ? { float: 'right', ml: 1, position: 'relative', zIndex: 1 }
            : { mb: 1 })
        }}
      >
        <Typography
          variant="subtitle1"
          component="h3"
          className={hideTitle ? 'u-visuallyhidden' : undefined}
          sx={{ flex: 1 }}
        >
          {title}
        </Typography>
        {action}
      </Box>
      {children}
    </Box>
  )
}
