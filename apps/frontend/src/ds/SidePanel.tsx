import {
  Box,
  Drawer,
  InputBase,
  MenuItem,
  Select,
  styled,
  Typography
} from '@linagora/twake-mui'
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactElement,
  type ReactNode,
  type RefObject
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
    ref.current?.focus()
    return () => {
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

/**
 * An open task: its header over two columns, the content (two thirds) and a
 * bar of properties (one third), one under the other on narrow screens.
 */
export function SidePanel({
  label,
  onClose,
  header,
  aside,
  children
}: {
  label: string
  onClose: () => void
  header: ReactNode
  aside?: ReactNode
  children: ReactNode
}): ReactElement {
  const host = useContext(PanelHostContext)
  const focused = useFocusWhileOpen(host)
  const top = (
    <Box sx={{ ...CRUMB_BAR, borderBottom: 1, borderColor: 'divider' }}>
      {header}
    </Box>
  )
  const main = (
    <Box
      sx={{
        minWidth: 0,
        px: { xs: 2, sm: 3 },
        py: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 3
      }}
    >
      {children}
    </Box>
  )
  // The header tops the content only: the bar of properties runs from the
  // top, all on the same white.
  const body = (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: aside ? '2fr 1fr' : '1fr' },
        overflowY: { xs: 'auto', md: 'hidden' }
      }}
    >
      <Box
        sx={{
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {top}
        <Box sx={{ flex: 1, minHeight: 0, overflowY: { md: 'auto' } }}>
          {main}
        </Box>
      </Box>
      {aside && (
        <Box
          component="aside"
          sx={{
            minWidth: 0,
            overflowY: { md: 'auto' },
            px: { xs: 2, sm: 3 },
            py: 2,
            // As thin and light as the header's line: widths only, since a
            // `border` shorthand in a breakpoint resets the colour to the text.
            borderStyle: 'solid',
            borderColor: 'divider',
            borderWidth: 0,
            borderTopWidth: { xs: '1px', md: 0 },
            borderLeftWidth: { md: '1px' },
            display: 'flex',
            flexDirection: 'column',
            gap: 3
          }}
        >
          {aside}
        </Box>
      )}
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
      onKeyDown={event => {
        if (event.key !== 'Escape' || inField(document.activeElement)) return
        event.stopPropagation()
        onClose()
      }}
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        outline: 'none'
      }}
    >
      {body}
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
  onChange
}: {
  labelId: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}): ReactElement {
  return (
    <Select
      size="small"
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
        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' },
        '&:hover': { bgcolor: 'action.hover' },
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
        gridTemplateColumns: { xs: '6.5rem 1fr', sm: '8rem 1fr' },
        columnGap: 2,
        rowGap: 0.5,
        alignItems: 'center'
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
  return (
    <>
      <Box
        component="dt"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          minHeight: 40,
          color: 'text.secondary',
          '& svg': { width: 16, height: 16, flexShrink: 0 }
        }}
      >
        {icon}
        <Typography id={id} variant="body2" color="inherit" noWrap>
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
    </>
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
  children
}: {
  avatar: ReactNode
  label?: string
  children: ReactNode
}): ReactElement {
  return (
    <Box
      component="li"
      aria-label={label}
      sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}
    >
      <Box sx={{ pt: 0.25 }}>{avatar}</Box>
      <Box sx={{ minWidth: 0, flex: 1, '& p': { my: 0.5 } }}>{children}</Box>
    </Box>
  )
}

export function TaskHead({ children }: { children: ReactNode }): ReactElement {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {children}
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
