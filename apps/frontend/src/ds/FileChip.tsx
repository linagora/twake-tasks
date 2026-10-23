import { CrossSmall, getFileTypeIcon, Icon } from '@linagora/twake-icons'
import { Box, Chip, Tooltip, Typography } from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

/** `report.final.pdf` → `report.final` and `.pdf`, so the name alone is cut short. */
export function splitExtension(filename: string): {
  base: string
  extension: string
} {
  const dot = filename.lastIndexOf('.')
  return dot > 0 && dot < filename.length - 1
    ? { base: filename.slice(0, dot), extension: filename.slice(dot) }
    : { base: filename, extension: '' }
}

/**
 * A linked file, as Twake Calendar shows the files of an event: its type's
 * icon, its name, and a cross to unlink it. It opens in a new tab.
 */
export function FileChip({
  name,
  mimeType,
  url,
  openLabel,
  remove
}: {
  name: string
  mimeType: string | null
  url: string
  openLabel: string
  remove?: { label: string; onClick: () => void } | undefined
}): ReactElement {
  const { base, extension } = splitExtension(name)
  return (
    <Tooltip title={name} placement="top">
      {/* The tooltip needs a child that takes its props and ref, as in Twake Calendar. */}
      <Box component="span" sx={{ display: 'inline-flex', maxWidth: '100%' }}>
        <Chip
          square
          variant="outlined"
          // White, as the files of an event in Twake Calendar, whose
          // twake-mui 13 drew the secondary chip so.
          sx={{ bgcolor: 'background.paper' }}
          onClick={() => {
            // A public link of Twake Drive, outside the app.
            window.open(url, '_blank', 'noopener,noreferrer')
          }}
          aria-label={openLabel}
          icon={<Icon icon={getFileTypeIcon(name, mimeType ?? undefined)} />}
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
              <Typography
                variant="body2"
                component="span"
                sx={{
                  minWidth: 0,
                  maxWidth: 160,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {base}
              </Typography>
              {extension && (
                <Typography
                  variant="body2"
                  component="span"
                  sx={{ flex: 'none' }}
                >
                  {extension}
                </Typography>
              )}
            </Box>
          }
          {...(remove
            ? {
                onDelete: remove.onClick,
                deleteIcon: (
                  <Icon
                    icon={CrossSmall}
                    size={16}
                    aria-label={remove.label}
                    role="button"
                  />
                )
              }
            : {})}
        />
      </Box>
    </Tooltip>
  )
}

/** The linked files of a task, a chip each. */
export function FileChipList({
  label,
  children
}: {
  label: string
  children: ReactNode[]
}): ReactElement {
  return (
    <Box
      component="ul"
      aria-label={label}
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1,
        m: 0,
        p: 0,
        listStyle: 'none'
      }}
    >
      {children.map((chip, index) => (
        <Box component="li" key={index} sx={{ minWidth: 0 }}>
          {chip}
        </Box>
      ))}
    </Box>
  )
}
