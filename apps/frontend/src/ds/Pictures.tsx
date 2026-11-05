import { Box, ButtonBase, Typography, type Theme } from '@linagora/twake-mui'
import type { MouseEvent, ReactElement, ReactNode } from 'react'

/** The radius of a board's cover on its card, as Twake Space's tiles. */
export const COVER_RADIUS = '12px'

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
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        columnGap: 1.5,
        rowGap: 2
      }}
    >
      {children}
    </Box>
  )
}

/**
 * A picture to pick, as a board's card draws it, its name under it. Without
 * a picture, `face` in its place on the grey of a board without cover, or on
 * the pale blue of an action when `action`.
 */
export function PictureTile({
  label,
  src,
  face,
  selected,
  action = false,
  onClick
}: {
  label: string
  src: string | null
  face?: ReactNode
  selected: boolean
  action?: boolean
  onClick: (event: MouseEvent<HTMLElement>) => void
}): ReactElement {
  return (
    <Box component="li">
      <ButtonBase
        aria-pressed={selected}
        onClick={onClick}
        sx={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 0.75,
          borderRadius: '8px',
          '&:hover > [data-preview]': { borderColor: 'primary.main' }
        }}
      >
        <Box
          data-preview=""
          sx={{
            aspectRatio: '3 / 2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '8px',
            border: 1,
            borderColor: selected ? 'primary.main' : 'divider',
            outline: selected ? 2 : 0,
            outlineColor: 'primary.main',
            color: 'primary.main',
            ...(src ? backdropOf(src) : action ? ACTION : NO_COVER)
          }}
        >
          {face}
        </Box>
        <Typography
          variant="caption"
          noWrap
          sx={{
            textAlign: 'left',
            color: selected ? 'primary.main' : 'text.secondary'
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

/** A board without cover: the dotted grey of the board tiles of Twake Space. */
export const NO_COVER = {
  bgcolor: 'background.default',
  backgroundImage: (theme: Theme) =>
    `radial-gradient(${theme.vars.palette.action.selected} 1px, transparent 1px)`,
  backgroundSize: '17px 17px'
} as const

/** A tile that adds rather than picks, as Blank board in Twake Board. */
export const ACTION = {
  bgcolor: (theme: Theme) => theme.alpha(theme.vars.palette.primary.main, 0.12)
} as const
