import { Box, ButtonBase, Typography } from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

const COLUMNS = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) repeat(3, 4.5rem)',
  alignItems: 'center',
  columnGap: 1,
  px: 1
} as const

/** Three counts a person, under headings drawn once above the rows. */
export function LoadList({
  columns,
  children
}: {
  columns: [string, string, string]
  children: ReactNode
}): ReactElement {
  return (
    <>
      <Box aria-hidden sx={{ ...COLUMNS, pb: 1 }}>
        <span />
        {columns.map(column => (
          <Typography
            key={column}
            variant="caption"
            color="textSecondary"
            sx={{ textAlign: 'end', lineHeight: 1.2 }}
          >
            {column}
          </Typography>
        ))}
      </Box>
      <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
        {children}
      </Box>
    </>
  )
}

/** The second count is in red once above zero. */
export function LoadRow({
  avatar,
  name,
  counts,
  label,
  onClick
}: {
  avatar: ReactNode
  name: string
  counts: [number, number, number]
  /** The whole row, read as one button. */
  label: string
  onClick: () => void
}): ReactElement {
  return (
    <li>
      <ButtonBase
        aria-label={label}
        onClick={onClick}
        sx={{
          ...COLUMNS,
          width: '100%',
          minHeight: 44,
          borderRadius: 2,
          textAlign: 'start',
          '&:hover': { bgcolor: 'action.hover' },
          '&.Mui-focusVisible': { outline: 2, outlineColor: 'primary.main' }
        }}
      >
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}
        >
          {avatar}
          <Typography variant="body2" noWrap>
            {name}
          </Typography>
        </Box>
        {counts.map((value, index) => {
          const late = index === 1 && value > 0
          return (
            <Typography
              key={index}
              variant="body2"
              sx={{
                textAlign: 'end',
                fontVariantNumeric: 'tabular-nums',
                color: late ? 'error.main' : 'text.primary',
                fontWeight: late ? 600 : undefined
              }}
            >
              {value}
            </Typography>
          )
        })}
      </ButtonBase>
    </li>
  )
}
