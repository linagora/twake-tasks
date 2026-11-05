import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  Divider,
  FormControlLabel,
  Typography
} from '@linagora/twake-mui'
import { useId, useState, type ReactElement } from 'react'

import { DialogHeader } from '@/ds/DialogHeader'
import type { Board } from '@/domain/board'
import { download, exportCsv, exportFileName } from '@/ui/boards/boardCsv'
import { useI18n } from '@/ui/i18n/useI18n'
import { useExportTasks } from '@/ui/queries/boards'

export function ExportDialog({
  board,
  onClose
}: {
  board: Board
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const [withArchived, setWithArchived] = useState(false)
  const exporting = useExportTasks(board.id)

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="small">
      <DialogHeader
        id={titleId}
        title={t('csv.exportTitle')}
        close={{ label: t('csv.close'), onClick: onClose }}
      />
      <DialogContent>
        <Typography color="text.secondary">{t('csv.exportText')}</Typography>
        <FormControlLabel
          className="u-mt-1"
          label={t('csv.includeArchived')}
          control={
            <Checkbox
              checked={withArchived}
              onChange={event => {
                setWithArchived(event.target.checked)
              }}
            />
          }
        />
        {exporting.isError && (
          <Typography role="alert" color="error" className="u-mt-1">
            {t('csv.exportFailed')}
          </Typography>
        )}
      </DialogContent>
      <Divider />
      <DialogActions>
        <Button variant="text" onClick={onClose}>
          {t('csv.cancel')}
        </Button>
        <Button
          variant="contained"
          disabled={exporting.isPending}
          onClick={() => {
            exporting.mutate(withArchived, {
              onSuccess: tasks => {
                download(
                  exportFileName(board.name, new Date()),
                  exportCsv(board, tasks, withArchived, t)
                )
                onClose()
              }
            })
          }}
        >
          {t('csv.download')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
