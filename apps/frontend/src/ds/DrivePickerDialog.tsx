import { CrossMedium, Icon } from '@linagora/twake-icons'
import { Box, Dialog, IconButton, Skeleton } from '@linagora/twake-mui'
import type { ReactElement, Ref } from 'react'

/**
 * The frame Twake Drive's own picker opens in, as in Twake Calendar: a
 * skeleton until the picker is ready, which then shows its own close button.
 */
export function DrivePickerDialog({
  open,
  ready,
  label,
  closeLabel,
  containerRef,
  onClose
}: {
  open: boolean
  ready: boolean
  label: string
  closeLabel: string
  containerRef: Ref<HTMLDivElement>
  onClose: () => void
}): ReactElement {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      slotProps={{
        // The dialog role is on the paper, which takes no aria-label otherwise.
        paper: {
          'aria-label': label,
          sx: {
            maxWidth: 900,
            height: '80vh',
            maxHeight: 800,
            position: 'relative',
            overflow: 'hidden'
          }
        }
      }}
    >
      {!ready && (
        <Box sx={{ position: 'absolute', inset: 0, p: 3, zIndex: 1 }}>
          <Skeleton variant="rectangular" height={48} sx={{ mb: 2 }} />
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} height={40} />
          ))}
          <IconButton
            aria-label={closeLabel}
            onClick={onClose}
            sx={{ position: 'absolute', top: 12, right: 12 }}
          >
            <Icon icon={CrossMedium} />
          </IconButton>
        </Box>
      )}
      <Box
        ref={containerRef}
        sx={{
          position: 'absolute',
          inset: 0,
          '& > iframe': {
            width: '100%',
            height: '100%',
            border: 'none',
            bgcolor: 'background.paper'
          }
        }}
      />
    </Dialog>
  )
}
