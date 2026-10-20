import { CrossSmall, getFileTypeIcon, Icon } from '@linagora/twake-icons'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  Typography
} from '@linagora/twake-mui'
import { useId, type ReactElement, type ReactNode } from 'react'

import { DialogHeader } from '@/ds/DialogHeader'

export interface TransferRow {
  id: string
  name: string
  mimeType: string | null
  /** The size while it runs, then how it ended. */
  status: string
  /** From 0 to 1, null when the transfer cannot tell. */
  progress: number | null
  settled: boolean
}

export interface FileTransferLabels {
  title: string
  cancel: string
  cancelAll: string
}

/**
 * The file transfer dialog of Twake Mail: a row per file, each with its
 * progress and a cross, and Cancel for them all while any runs.
 */
export function FileTransferDialog({
  open,
  labels,
  description,
  rows,
  onCancel,
  onCancelAll
}: {
  open: boolean
  labels: FileTransferLabels
  description: ReactNode
  rows: TransferRow[]
  onCancel: (id: string) => void
  onCancelAll: () => void
}): ReactElement {
  const titleId = useId()
  const running = rows.some(row => !row.settled)
  return (
    <Dialog
      open={open}
      onClose={onCancelAll}
      aria-labelledby={titleId}
      size="medium"
    >
      <DialogHeader
        id={titleId}
        title={labels.title}
        close={{ label: labels.cancel, onClick: onCancelAll }}
      />
      <DialogContent className="u-pb-1-half">
        <Typography variant="body2" color="textSecondary">
          {description}
        </Typography>
        <List aria-label={labels.title} sx={{ mt: 1 }}>
          {rows.map(row => (
            <ListItem
              key={row.id}
              aria-label={row.name}
              disableGutters
              sx={{ gap: 1.5, alignItems: 'center' }}
            >
              <Icon
                icon={getFileTypeIcon(row.name, row.mimeType ?? undefined)}
                size={20}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                    {row.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    role="status"
                    sx={{ flex: 'none' }}
                  >
                    {row.status}
                  </Typography>
                </Box>
                <LinearProgress
                  variant={
                    row.progress === null && !row.settled
                      ? 'indeterminate'
                      : 'determinate'
                  }
                  value={(row.progress ?? (row.settled ? 1 : 0)) * 100}
                  aria-label={row.name}
                  sx={{ mt: 0.5, borderRadius: 1 }}
                />
              </Box>
              <IconButton
                size="small"
                aria-label={`${labels.cancel} ${row.name}`}
                disabled={row.settled}
                onClick={() => {
                  onCancel(row.id)
                }}
              >
                <Icon icon={CrossSmall} size={14} />
              </IconButton>
            </ListItem>
          ))}
        </List>
        {running && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
            <Button variant="secondary" onClick={onCancelAll}>
              {labels.cancelAll}
            </Button>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  )
}
