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
  type ReactElement,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'

function inField(element: Element | null): boolean {
  return element?.matches('input, textarea, [contenteditable]') ?? false
}

/**
 * Where a task opens: the content area of the frame, under the top bar and
 * beside the sidebar, which stay in reach. Without it, as in an embed, the
 * task opens in a drawer.
 */
export const PanelHostContext = createContext<HTMLElement | null>(null)

// A stable callback ref: an inline one would steal the focus on every render.
const focusOnMount = (element: HTMLElement | null): void => {
  element?.focus()
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
  const top = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        flex: '0 0 auto',
        minHeight: 56,
        px: { xs: 2, sm: 3 },
        borderBottom: 1,
        borderColor: 'divider'
      }}
    >
      {header}
    </Box>
  )
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
          overflowY: { md: 'auto' },
          px: { xs: 2, sm: 3 },
          py: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 3
        }}
      >
        {children}
      </Box>
      {aside && (
        <Box
          component="aside"
          sx={{
            minWidth: 0,
            overflowY: { md: 'auto' },
            px: { xs: 2, sm: 3 },
            py: 2,
            borderTop: { xs: 1, md: 0 },
            borderLeft: { md: 1 },
            borderColor: 'divider',
            bgcolor: 'background.default',
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
        {top}
        {body}
      </Drawer>
    )
  }
  return createPortal(
    <Box
      ref={focusOnMount}
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
      {top}
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

export function PanelSection({
  title,
  action,
  children
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}): ReactElement {
  return (
    <Box component="section" aria-label={title}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 1 }}>
        <Typography variant="subtitle1" component="h3" sx={{ flex: 1 }}>
          {title}
        </Typography>
        {action}
      </Box>
      {children}
    </Box>
  )
}
