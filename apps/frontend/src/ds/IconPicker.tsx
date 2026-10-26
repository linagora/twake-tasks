import { Icon } from '@linagora/twake-icons'
import { Box, Popover, Typography } from '@linagora/twake-mui'
import { useRef, useState, type ReactElement } from 'react'

import { SearchBar } from '@/ds/SearchBar'
import { searchIcons, viewIcon, VIEW_ICONS } from '@/ds/viewIcons'

export interface IconPickerLabels {
  button: string
  title: string
  search: string
  noResult: string
}

// A framed icon beside a field, as Notion's page icon: clicking it opens every
// icon, black and white like those of the sidebar.
export function IconPicker({
  value,
  onChange,
  labels
}: {
  value: string
  onChange: (name: string) => void
  labels: IconPickerLabels
}): ReactElement {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const typed = search.trim()
  const groups =
    typed === ''
      ? [{ id: 'all', label: '', names: VIEW_ICONS }]
      : [{ id: 'found', label: '', names: searchIcons(typed) }]
  const close = (): void => {
    setAnchor(null)
    setSearch('')
  }

  return (
    <>
      <Box
        component="button"
        type="button"
        aria-label={labels.button}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        title={labels.button}
        onClick={event => {
          setAnchor(event.currentTarget)
        }}
        sx={{
          width: 56,
          height: 56,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 0,
          cursor: 'pointer',
          color: 'text.primary',
          bgcolor: 'transparent',
          border: 1,
          borderColor: anchor ? 'primary.main' : 'divider',
          borderRadius: 1,
          '&:hover': { bgcolor: 'action.hover', borderColor: 'text.primary' },
          '&:focus-visible': {
            outline: 2,
            outlineColor: 'primary.main',
            outlineOffset: 2
          }
        }}
      >
        <Icon icon={viewIcon(value)} size={20} />
      </Box>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={close}
        disableAutoFocus
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          transition: {
            onEntering: () => {
              searchRef.current?.focus()
            }
          },
          paper: {
            role: 'dialog',
            'aria-label': labels.title,
            sx: { width: 360, maxWidth: 'calc(100vw - 32px)', mt: 0.5 }
          }
        }}
      >
        <Box sx={{ p: 1.5, pb: 0.5 }}>
          <Typography
            variant="subtitle2"
            component="h2"
            sx={{ fontWeight: 600, mb: 1 }}
          >
            {labels.title}
          </Typography>
          <SearchBar
            size="small"
            elevation={0}
            placeholder={labels.search}
            value={search}
            onChange={event => {
              setSearch(event.target.value)
            }}
            onClear={() => {
              setSearch('')
            }}
            componentsProps={{
              inputBase: {
                inputRef: searchRef,
                inputProps: { 'aria-label': labels.search, maxLength: 50 }
              }
            }}
          />
        </Box>
        <Box sx={{ px: 1.5, pb: 1.5, maxHeight: 340, overflowY: 'auto' }}>
          {groups.every(group => group.names.length === 0) && (
            <Typography variant="body2" color="textSecondary" sx={{ py: 1 }}>
              {labels.noResult}
            </Typography>
          )}
          {groups.map(
            group =>
              group.names.length > 0 && (
                <Box
                  key={group.id}
                  role="group"
                  aria-label={group.label || labels.title}
                >
                  {group.label && (
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      component="p"
                      sx={{ pt: 1, pb: 0.5, fontWeight: 600 }}
                    >
                      {group.label}
                    </Typography>
                  )}
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, 36px)',
                      gap: 0.5
                    }}
                  >
                    {group.names.map(name => (
                      <Box
                        key={name}
                        component="button"
                        type="button"
                        aria-label={name}
                        aria-pressed={name === value}
                        title={name}
                        onClick={() => {
                          onChange(name)
                          close()
                        }}
                        sx={{
                          width: 36,
                          height: 36,
                          p: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: 0,
                          borderRadius: 1.5,
                          cursor: 'pointer',
                          color: 'text.primary',
                          bgcolor:
                            name === value ? 'action.selected' : 'transparent',
                          '&:hover': { bgcolor: 'action.hover' },
                          '&:focus-visible': {
                            outline: 2,
                            outlineColor: 'primary.main'
                          }
                        }}
                      >
                        <Icon icon={viewIcon(name)} size={18} />
                      </Box>
                    ))}
                  </Box>
                </Box>
              )
          )}
        </Box>
      </Popover>
    </>
  )
}
