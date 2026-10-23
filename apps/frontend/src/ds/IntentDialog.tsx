import { Cross, Icon } from '@linagora/twake-icons'
import { Alert, Box, Dialog, IconButton } from '@linagora/twake-mui'
import { useCallback, useEffect, useState, type ReactElement } from 'react'

/**
 * Holds the frame of another app's service (the Twake Drive picker), which a
 * script puts in the container. The service draws its own title, and its
 * own close button once ready.
 */
export function IntentDialog({
  open,
  title,
  error,
  onClose,
  onContainer,
  closeButton
}: {
  open: boolean
  /** Names the dialog and the frame for screen readers. */
  title: string
  error: string | null
  onClose: () => void
  onContainer: (element: HTMLDivElement | null) => void
  closeButton: { label: string; isShown: boolean }
}): ReactElement {
  // State, not a ref: the dialog mounts its content after its own effects run
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const container = useCallback(
    (next: HTMLDivElement | null) => {
      setElement(next)
      onContainer(next)
    },
    [onContainer]
  )
  // The frame comes without a title
  useEffect(() => {
    if (!element) return
    const observer = new MutationObserver(() => {
      element.querySelector('iframe')?.setAttribute('title', title)
    })
    observer.observe(element, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
    }
  }, [element, title])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="full"
      maxWidth={false}
      aria-label={title}
      // The focus goes into the frame, which the focus trap would take back
      disableEnforceFocus
      slotProps={{
        paper: {
          // Twice the class: twake-mui sizes the paper with `&.full`
          sx: {
            '&&:not(.MuiDialog-paperFullScreen)': {
              m: 2,
              width: 'auto',
              maxWidth: 'calc(100% - 32px)',
              maxHeight: 'calc(100% - 32px)'
            }
          }
        }
      }}
    >
      {error && (
        <Alert severity="error" role="alert" sx={{ m: 2, mr: 7 }}>
          {error}
        </Alert>
      )}
      <Box
        ref={container}
        data-testid="intent-container"
        // cozy-interapp writes the size the service asks for on this box
        sx={{
          width: 900,
          height: 800,
          maxWidth: '100%',
          minHeight: 0,
          flexShrink: 1,
          '.MuiDialog-paperFullScreen > &': {
            width: 'auto',
            height: 'auto',
            flex: 1
          },
          '& iframe': {
            display: 'block',
            width: '100%',
            height: '100%',
            border: 0
          }
        }}
      />
      {closeButton.isShown && (
        <IconButton
          aria-label={closeButton.label}
          onClick={onClose}
          sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
        >
          <Icon icon={Cross} />
        </IconButton>
      )}
    </Dialog>
  )
}
