import {
  Box,
  ListItem,
  ListItemIcon,
  ListItemSkeleton,
  ListItemText,
  MenuItem,
  MenuList,
  Paper,
  Popper
} from '@linagora/twake-mui'
import {
  useEffect,
  useRef,
  type ElementType,
  type ReactElement,
  type ReactNode
} from 'react'

export interface ResultItem {
  id: string
  to: string
  icon: ReactNode
  primary: ReactNode
  secondary: ReactNode
  /** Why it answers, when its name does not show it: a line of its own. */
  detail?: ReactNode
}

/** The results of a search as they are typed, under the field and as wide as it, as Twake Drive's. */
export function ResultMenu({
  anchor,
  id,
  items,
  selected,
  loading,
  message,
  link,
  onChoose
}: {
  anchor: HTMLElement | null
  id: string
  items: ResultItem[]
  selected: number
  loading: boolean
  message: string | null
  /** The app's link, which each result is, to its `to`. */
  link: ElementType
  onChoose: () => void
}): ReactElement {
  return (
    <Popper
      open={anchor !== null}
      anchorEl={anchor}
      placement="bottom-start"
      sx={theme => ({
        width: anchor?.offsetWidth,
        zIndex: theme.zIndex.modal
      })}
    >
      <Paper
        square
        // The field keeps the focus, so that typing goes on.
        onMouseDown={event => {
          event.preventDefault()
        }}
        sx={{
          overflow: 'hidden',
          maxHeight: '16.5rem',
          borderRadius: '0 0 20px 20px'
        }}
      >
        <MenuList
          id={id}
          role="listbox"
          // The field keeps the focus and moves through the results itself.
          autoFocus={false}
          variant="menu"
          sx={{ maxHeight: '16.5rem', overflow: 'auto' }}
        >
          {items.map((item, index) => (
            <ResultMenuItem
              key={item.id}
              id={`${id}-${String(index)}`}
              item={item}
              selected={index === selected}
              link={link}
              onChoose={onChoose}
            />
          ))}
          {items.length === 0 &&
            (loading ? (
              <>
                <ListItemSkeleton hasSecondary />
                <ListItemSkeleton hasSecondary />
                <ListItemSkeleton hasSecondary />
              </>
            ) : (
              message && (
                <ListItem role="option" aria-selected={false} aria-disabled>
                  <ListItemText primary={message} />
                </ListItem>
              )
            ))}
        </MenuList>
      </Paper>
    </Popper>
  )
}

function ResultMenuItem({
  id,
  item,
  selected,
  link,
  onChoose
}: {
  id: string
  item: ResultItem
  selected: boolean
  link: ElementType
  onChoose: () => void
}): ReactElement {
  const ref = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])
  return (
    <MenuItem
      id={id}
      ref={ref}
      component={link}
      to={item.to}
      role="option"
      aria-selected={selected}
      selected={selected}
      tabIndex={-1}
      onClick={onChoose}
      sx={{ color: 'text.primary' }}
    >
      {/* Icons drawn in currentColor take the colour of text. */}
      <ListItemIcon sx={{ color: 'text.primary' }}>{item.icon}</ListItemIcon>
      <ListItemText
        primary={item.primary}
        secondary={
          <>
            {item.secondary}
            {item.detail && (
              <Box
                component="span"
                sx={{
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {item.detail}
              </Box>
            )}
          </>
        }
      />
    </MenuItem>
  )
}
