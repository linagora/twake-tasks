import { Box, ButtonBase } from '@linagora/twake-mui'
import {
  use,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject
} from 'react'

import { ScrollHostContext } from '@/ds/CrumbBar'
import { Icon, type IconProps } from '@/ds/Icon'
import { useReducedMotion } from '@/ds/motion'
import { tonal } from '@/ds/SettingsCard'

export interface SettingsSection {
  id: string
  icon: IconProps['icon']
  label: string
}

const SETTLE_MS = 150

// Ends a pick once the page stops scrolling. Not scrollend: some browsers lack
// it, and it never fires when the page is already in place. The pick stays
// current after that, even when the page cannot bring it to the top: the
// person's next scroll moves it.
function holdPick(picked: RefObject<boolean>, settling: RefObject<number>) {
  window.clearTimeout(settling.current)
  settling.current = window.setTimeout(() => {
    picked.current = false
  }, SETTLE_MS)
}

/** The section whose top has passed the upper third of the scrolling page. */
function useSectionInView(ids: string[]) {
  const host = use(ScrollHostContext)
  const [current, setCurrent] = useState(ids[0])
  // A section picked from the menu stays current while the page scrolls to it.
  const picked = useRef(false)
  const settling = useRef(0)
  const key = ids.join()

  useEffect(() => {
    if (!host) return
    const sections = key.split(',')
    const update = () => {
      // A page not laid out yet has nothing to measure.
      if (host.clientHeight === 0) return
      const line = host.getBoundingClientRect().top + host.clientHeight / 3
      const atEnd =
        host.scrollTop > 0 &&
        host.scrollTop + host.clientHeight >= host.scrollHeight - 1
      setCurrent(
        atEnd
          ? sections.at(-1)
          : (sections.findLast(
              id =>
                (document.getElementById(id)?.getBoundingClientRect().top ??
                  Infinity) <= line
            ) ?? sections[0])
      )
    }
    const onScroll = () => {
      if (picked.current) holdPick(picked, settling)
      else update()
    }
    update()
    host.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      host.removeEventListener('scroll', onScroll)
    }
  }, [host, key])

  const pick = (id: string) => {
    picked.current = true
    setCurrent(id)
    holdPick(picked, settling)
  }
  return [current, pick] as const
}

/**
 * The settings in one column of sections, with a menu of them that stays in
 * view: at the left on a wide screen, a row of chips above them on a phone.
 */
export function SettingsLayout({
  label,
  sections,
  children
}: {
  label: string
  sections: SettingsSection[]
  children: ReactNode
}): ReactElement {
  const [current, pick] = useSectionInView(sections.map(({ id }) => id))
  const reduced = useReducedMotion()

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: 'minmax(0, 1fr)',
          md: '12.5rem minmax(0, 760px)'
        },
        columnGap: 3,
        alignItems: 'start'
      }}
    >
      <Box
        component="nav"
        aria-label={label}
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          display: 'flex',
          flexDirection: { xs: 'row', md: 'column' },
          gap: { xs: 1, md: 0.25 },
          overflowX: { xs: 'auto', md: 'visible' },
          mx: { xs: -2, md: 0 },
          px: { xs: 2, md: 0 },
          py: { xs: 1, md: 0 },
          mb: { xs: 1, md: 0 },
          bgcolor: { xs: 'background.paper', md: 'transparent' }
        }}
      >
        {sections.map(({ id, icon, label: name }) => {
          const on = id === current
          return (
            <ButtonBase
              key={id}
              href={`#${id}`}
              aria-current={on ? 'true' : undefined}
              onClick={event => {
                // Following #id would push a history entry through the router.
                event.preventDefault()
                pick(id)
                const section = document.getElementById(id)
                section?.scrollIntoView({
                  behavior: reduced ? 'auto' : 'smooth',
                  block: 'start'
                })
                section?.focus({ preventScroll: true })
              }}
              sx={[
                theme => ({
                  ...theme.typography.body2,
                  justifyContent: 'flex-start',
                  flexShrink: 0,
                  gap: 1.25,
                  color: 'text.secondary',
                  whiteSpace: 'nowrap',
                  borderRadius: { xs: 100, md: '10px' },
                  px: 1.5,
                  py: { xs: 0.75, md: 1.125 },
                  border: { xs: 1, md: 0 },
                  borderColor: { xs: 'divider' },
                  '&:hover': { bgcolor: 'action.hover' }
                }),
                on &&
                  (theme => ({
                    color: 'text.primary',
                    fontWeight: 500,
                    borderColor: 'transparent',
                    [theme.breakpoints.down('md')]: tonal(theme),
                    [theme.breakpoints.up('md')]: {
                      '&, &:hover': { bgcolor: 'action.selected' }
                    }
                  }))
              ]}
            >
              <Icon icon={icon} size={18} />
              {name}
            </ButtonBase>
          )
        })}
      </Box>
      <Box sx={{ display: 'grid', gap: 2, minWidth: 0 }}>{children}</Box>
    </Box>
  )
}
