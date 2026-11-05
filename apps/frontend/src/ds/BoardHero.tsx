import { Box, keyframes, Skeleton, Typography } from '@linagora/twake-mui'
import {
  use,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject
} from 'react'

import { CrumbHostContext, CrumbSlot, ScrollHostContext } from '@/ds/CrumbBar'
import { motion, MOTION_MS } from '@/ds/motion'
import { HEADER_ACTIONS, TITLE_FLEX } from '@/ds/PageHeader'
import { backdropOf } from '@/ds/Pictures'

// Collapses past the first rows, and only when the page still scrolls once
// collapsed: else it would expand again at once.
const COLLAPSE_AFTER = 48
const EXPAND_BEFORE = 8
const COLLAPSED_HEIGHT = 44

const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })

/** Whether the page has scrolled past the header, which then collapses. */
function useCollapsed(hero: RefObject<HTMLElement | null>): boolean {
  const host = use(ScrollHostContext)
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    if (!host) return
    const onScroll = () => {
      // Collapsing gives the page the height the header loses.
      const shrink = (hero.current?.offsetHeight ?? 0) - COLLAPSED_HEIGHT
      setCollapsed(was =>
        was
          ? host.scrollTop > EXPAND_BEFORE
          : host.scrollTop > COLLAPSE_AFTER &&
            host.scrollHeight - host.clientHeight - shrink > COLLAPSE_AFTER
      )
    }
    // A board can open on a page already scrolled.
    onScroll()
    host.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      host.removeEventListener('scroll', onScroll)
    }
  }, [host, hero])
  return collapsed
}

/** Whether the picture has loaded, for it to fade in rather than pop. */
function useLoaded(src: string | null): boolean {
  const [loaded, setLoaded] = useState<string | null>(null)
  useEffect(() => {
    if (!src || src.startsWith('#')) return
    const image = new Image()
    image.onload = () => {
      setLoaded(src)
    }
    image.src = src
    return () => {
      image.onload = null
    }
  }, [src])
  return src !== null && (src.startsWith('#') || loaded === src)
}

// The collapsed bar of a phone has room for the title and the filter alone.
function PhoneHidden({
  hidden,
  children
}: {
  hidden: boolean
  children: ReactNode
}): ReactElement {
  return (
    <Box sx={{ display: hidden ? { xs: 'none', sm: 'contents' } : 'contents' }}>
      {children}
    </Box>
  )
}

function Pill({
  glass,
  children
}: {
  glass: boolean
  children: ReactNode
}): ReactElement {
  return (
    <Box
      sx={theme => ({
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 1,
        borderRadius: 100,
        p: 0.5,
        m: -0.5,
        ...(glass && {
          // A frosted ground over the picture keeps the buttons readable.
          bgcolor: theme.alpha(theme.vars.palette.background.paper, 0.8),
          backdropFilter: 'blur(10px)',
          boxShadow: theme.shadows[1]
        }),
        ...motion(theme, ['background-color', 'box-shadow'])
      })}
    >
      {children}
    </Box>
  )
}

/**
 * A board's header: its title and numbers on the page, its cover filling the
 * right part and fading out to the left. It collapses into a bar while the
 * page scrolls, and expands back at the top.
 */
export function BoardHero({
  picture,
  title,
  numbers,
  late,
  people,
  share,
  filter,
  views,
  menu
}: {
  picture: string | null
  title: ReactNode
  /** The numbers and the progress, hidden once collapsed. */
  numbers?: ReactNode
  /** Beside the title once collapsed. */
  late?: ReactNode
  people: ReactNode
  share: ReactNode
  filter: ReactNode
  views: ReactNode
  menu: ReactNode
}): ReactElement {
  const hero = useRef<HTMLDivElement>(null)
  const collapsed = useCollapsed(hero)
  const loaded = useLoaded(picture)
  const glass = picture !== null && !collapsed
  const embedded = use(CrumbHostContext) === null
  return (
    <CrumbSlot>
      <Box
        ref={hero}
        data-testid="board-hero"
        data-own-height=""
        data-collapsed={collapsed}
        sx={{
          position: 'relative',
          flexBasis: '100%',
          minWidth: 0,
          // The frame's page has room at its top, under the strip; an embed none.
          ...(embedded && { mb: 1 }),
          // To the right edge of the content, where the picture ends.
          ...(picture && {
            flexBasis: { xs: 'calc(100% + 16px)', sm: 'calc(100% + 24px)' },
            mr: { xs: -2, sm: -3 },
            pr: { xs: 2, sm: 3 }
          })
        }}
      >
        {picture && (
          <Box
            data-testid="board-hero-cover"
            aria-hidden
            sx={theme => ({
              ...backdropOf(picture),
              position: 'absolute',
              inset: '0 0 0 40%',
              maskImage: 'linear-gradient(to right, transparent, black 75%)',
              // On a phone the numbers span the width: the picture fades out
              // above them too.
              ...(numbers && {
                [theme.breakpoints.down('sm')]: {
                  maskImage:
                    'linear-gradient(to right, transparent, black 75%), linear-gradient(black calc(100% - 128px), transparent calc(100% - 80px))',
                  maskComposite: 'intersect'
                }
              }),
              opacity: loaded && !collapsed ? 1 : 0,
              ...motion(theme, ['opacity'])
            })}
          />
        )}
        <Box
          sx={theme => ({
            position: 'relative',
            display: 'flex',
            flexWrap: collapsed ? 'nowrap' : 'wrap',
            alignItems: 'center',
            columnGap: 2,
            rowGap: 1,
            minHeight: collapsed ? COLLAPSED_HEIGHT : { xs: 56, md: 72 },
            py: collapsed ? 0 : 1,
            ...motion(theme, ['min-height', 'padding'])
          })}
        >
          <Box
            sx={{
              flex: collapsed ? '1 1 auto' : TITLE_FLEX,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5
            }}
          >
            {picture && (
              <Box
                data-testid="board-hero-thumbnail"
                aria-hidden
                sx={theme => ({
                  ...backdropOf(picture),
                  flex: 'none',
                  height: 28,
                  width: collapsed ? 28 : 0,
                  // Cancels the gap while it has no width.
                  mr: collapsed ? 0 : -1.5,
                  borderRadius: '8px',
                  opacity: collapsed ? 1 : 0,
                  ...motion(theme, ['width', 'margin', 'opacity'])
                })}
              />
            )}
            <Box
              sx={{ flex: collapsed ? '0 1 auto' : '1 1 auto', minWidth: 0 }}
            >
              {title}
            </Box>
            {collapsed && late && (
              <Box
                sx={{
                  flex: 'none',
                  animation: `${fadeIn} ${String(MOTION_MS)}ms`,
                  '@media (prefers-reduced-motion: reduce)': {
                    animation: 'none'
                  }
                }}
              >
                {late}
              </Box>
            )}
          </Box>
          <Box
            sx={{
              ...HEADER_ACTIONS,
              ...(collapsed && { flexWrap: 'nowrap', flexShrink: 0 })
            }}
          >
            <PhoneHidden hidden={collapsed}>
              <Pill glass={glass}>{people}</Pill>
            </PhoneHidden>
            <Pill glass={glass}>
              <PhoneHidden hidden={collapsed}>{share}</PhoneHidden>
              {filter}
              <PhoneHidden hidden={collapsed}>{views}</PhoneHidden>
              {menu}
            </Pill>
          </Box>
        </Box>
        {numbers && (
          <Box
            aria-hidden={collapsed}
            sx={theme => ({
              position: 'relative',
              display: 'grid',
              gridTemplateRows: collapsed ? '0fr' : '1fr',
              opacity: collapsed ? 0 : 1,
              ...motion(theme, ['grid-template-rows', 'opacity'])
            })}
          >
            <Box sx={{ minHeight: 0, overflow: 'hidden' }}>
              <Box
                data-testid="board-hero-numbers"
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.25,
                  pb: 2
                }}
              >
                {numbers}
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    </CrumbSlot>
  )
}

const pill = (width: number | { xs: number; sm: number }, height = 40) => (
  <Skeleton
    variant="rounded"
    height={height}
    sx={{ width, borderRadius: 100 }}
  />
)

/**
 * A board's header while the board loads, as tall as once loaded, so that the
 * columns do not move.
 */
export function BoardHeroSkeleton({
  title,
  share,
  numbers
}: {
  /** Omitted when not known yet, for a placeholder. */
  title?: ReactNode
  /** Whether a Share button will lead the buttons. */
  share: boolean
  /** Whether the board will show numbers: not when it has no tasks. */
  numbers: boolean
}): ReactElement {
  return (
    <BoardHero
      picture={null}
      title={title ?? <Skeleton width={240} sx={{ typography: 'h3' }} />}
      numbers={
        numbers && (
          <>
            <Typography variant="body2">
              <Skeleton width={280} sx={{ maxWidth: '100%' }} />
            </Typography>
            <Skeleton
              variant="rounded"
              height={6}
              sx={{ maxWidth: 420, borderRadius: 3 }}
            />
          </>
        )
      }
      people={pill(120, 32)}
      share={share && pill({ xs: 40, sm: 118 })}
      filter={pill({ xs: 264, sm: 320 })}
      views={null}
      menu={null}
    />
  )
}
