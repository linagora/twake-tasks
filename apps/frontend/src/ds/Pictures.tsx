import { Box, ButtonBase, Typography, type Theme } from '@linagora/twake-mui'
import type { MouseEvent, ReactElement, ReactNode } from 'react'

export function PictureGrid({
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
        display: 'grid',
        // About the size of the wallpapers the Home of Twake Workplace offers.
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 1
      }}
    >
      {children}
    </Box>
  )
}

/**
 * A picture to pick, or, without one, `face` drawn in its place, with its name
 * inside, at the bottom, as the wallpapers of Twake Workplace's Home: white
 * under a shade on a picture.
 */
export function PictureTile({
  label,
  src,
  face,
  selected,
  dashed = false,
  onClick
}: {
  label: string
  src: string | null
  face?: ReactNode
  selected: boolean
  /**
   * For a tile that adds a picture rather than picks one, pale blue as Import
   * among the wallpapers of Twake Workplace's Home.
   */
  dashed?: boolean
  onClick: (event: MouseEvent<HTMLElement>) => void
}): ReactElement {
  return (
    <Box component="li">
      <ButtonBase
        aria-pressed={selected}
        onClick={onClick}
        sx={{
          width: '100%',
          aspectRatio: '3 / 2',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 0.5,
          p: 1,
          borderRadius: '6px',
          border: 1,
          borderColor: selected
            ? 'primary.main'
            : dashed
              ? 'transparent'
              : 'divider',
          outline: selected ? 2 : 0,
          outlineColor: 'primary.main',
          bgcolor: dashed
            ? (theme: Theme) =>
                theme.alpha(theme.vars.palette.primary.main, 0.15)
            : 'background.paper',
          ...(src && shadedBackdropOf(src)),
          '&:focus-visible': {
            outline: 2,
            outlineColor: 'primary.main',
            outlineOffset: 2
          }
        }}
      >
        {face && (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              color: 'primary.main'
            }}
          >
            {face}
          </Box>
        )}
        <Typography
          variant="caption"
          noWrap
          sx={{
            maxWidth: '100%',
            color: src
              ? 'common.white'
              : selected || dashed
                ? 'primary.main'
                : 'text.secondary',
            ...(src && { textShadow: TEXT_SHADE })
          }}
        >
          {label}
        </Typography>
      </ButtonBase>
    </Box>
  )
}

/** The picture behind a board, or its plain `#` color, as `background` CSS. */
export const backdropOf = (src: string) =>
  src.startsWith('#')
    ? ({ backgroundColor: src } as const)
    : ({
        backgroundImage: `url("${src}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      } as const)

// SHADE alone is too light for white text on a pale picture such as Eclipse.
export const TEXT_SHADE = '0 1px 3px rgba(0, 0, 0, 0.45)'

// The shade of a space's cover in Twake Space, from its title side.
const SHADE =
  'linear-gradient(to right, rgba(27,31,41,0.12), rgba(27,31,41,0.08) 50%, rgba(27,31,41,0))'

/**
 * As backdropOf, under the shade of a space's cover in Twake Space, which
 * keeps white text readable on any picture or color.
 */
export const shadedBackdropOf = (src: string) =>
  src.startsWith('#')
    ? ({ backgroundColor: src, backgroundImage: SHADE } as const)
    : ({
        backgroundImage: `${SHADE}, url("${src}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      } as const)

/**
 * A board's picture behind its breadcrumb and actions, whatever its layout,
 * as the cover of a space in Twake Space, under its shade.
 */
export function BoardBanner({ src }: { src: string }): ReactElement {
  return (
    <Box
      data-testid="board-banner"
      data-picture=""
      aria-hidden
      sx={{
        ...shadedBackdropOf(src),
        position: 'absolute',
        top: 4,
        bottom: 4,
        left: { xs: 8, sm: 12 },
        right: { xs: 8, sm: 12 },
        zIndex: -1,
        borderRadius: '8px'
      }}
    />
  )
}

// The ink of a header on a picture, as r, g, b: white.
const INK = 'rgb(var(--cover-ink))'
const inkAt = (alpha: number) => `rgba(var(--cover-ink), ${String(alpha)})`

/**
 * A header that may hold a picture, as the cover of a space in Twake Space:
 * on it, the title marked `data-on-picture="title"` and the actions marked
 * `data-on-picture="actions"` are white.
 */
export const ON_PICTURE = {
  position: 'relative',
  isolation: 'isolate',
  '&:has(> [data-picture])': {
    '--cover-ink': '255, 255, 255',
    py: 1,
    '& [data-on-picture="title"]': {
      color: INK,
      '& .MuiTypography-root, & .MuiLink-root, & .MuiIconButton-root, & .MuiBreadcrumbs-separator':
        { color: 'inherit' },
      // A board being renamed: the field takes the title's place, size and
      // ink, its label left to screen readers.
      '& .MuiInputLabel-root': {
        position: 'absolute',
        width: 1,
        height: 1,
        overflow: 'hidden',
        clip: 'rect(0 0 0 0)'
      },
      '& .MuiOutlinedInput-notchedOutline': {
        borderColor: inkAt(0.7),
        '& legend': { display: 'none' }
      },
      '& .MuiInputBase-root': {
        color: INK,
        bgcolor: inkAt(0.12),
        '&:hover .MuiOutlinedInput-notchedOutline, &.Mui-focused .MuiOutlinedInput-notchedOutline':
          { borderColor: INK }
      },
      '& .MuiInputBase-input': {
        typography: 'h3',
        fontWeight: 700,
        py: 0.5
      }
    },
    // In the ink of the title, with a faint ground of it on hover and under
    // the layout shown. Doubled classes outweigh the toggles' own.
    '& [data-on-picture="actions"]': {
      color: INK,
      '& .MuiButton-root.MuiButton-root, & .MuiIconButton-root.MuiIconButton-root, & .MuiToggleButton-root.MuiToggleButton-root':
        {
          color: 'inherit',
          borderColor: inkAt(0.7),
          '&:hover': { bgcolor: inkAt(0.15) }
        },
      // Members' avatars without the ring that parts them on white.
      '& .MuiAvatar-root:not(.PersonAvatar-pending)': { border: 0 },
      '& .MuiToggleButton-root.MuiToggleButton-root.Mui-selected': {
        bgcolor: inkAt(0.2),
        '&:hover': { bgcolor: inkAt(0.3) }
      }
    }
  }
} as const
