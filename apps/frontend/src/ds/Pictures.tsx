import { Box, ButtonBase, Typography } from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

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
        gridTemplateColumns: {
          xs: 'repeat(2, minmax(0, 1fr))',
          sm: 'repeat(3, minmax(0, 1fr))'
        },
        gap: 2
      }}
    >
      {children}
    </Box>
  )
}

/** A picture to pick, or, without one, `face` drawn in its place. */
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
  /** For a tile that adds a picture rather than picks one. */
  dashed?: boolean
  onClick: () => void
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
          borderRadius: 2,
          '&:focus-visible': {
            outline: 2,
            outlineColor: 'primary.main',
            outlineOffset: 2
          }
        }}
      >
        <Box
          sx={{
            aspectRatio: '16 / 10',
            borderRadius: 2,
            border: dashed ? '1px dashed' : 1,
            borderColor: selected ? 'primary.main' : 'divider',
            outline: selected ? 2 : 0,
            outlineColor: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'primary.main',
            bgcolor: 'background.paper',
            ...(src && {
              backgroundImage: `url("${src}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            })
          }}
        >
          {face}
        </Box>
        <Typography
          variant="body2"
          color={selected ? 'primary' : 'textSecondary'}
          noWrap
        >
          {label}
        </Typography>
      </ButtonBase>
    </Box>
  )
}

/** The picture behind a board, as `background` CSS. */
export const backdropOf = (src: string) =>
  ({
    backgroundImage: `url("${src}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  }) as const
