import {
  Alert,
  Button,
  DialogActions,
  DialogContent,
  Divider,
  Typography
} from '@linagora/twake-mui'
import type { ReactElement } from 'react'

import type { ImportResult } from '@/application/boards'
import { defaultSection } from '@/application/newTask'
import type { Board } from '@/domain/board'
import { toCsv } from '@/domain/csv'
import type { SkipReason } from '@/domain/taskImport'
import { download, type CsvFile } from '@/ui/boards/boardCsv'
import { useI18n } from '@/ui/i18n/useI18n'

export interface Skipped {
  cells: string[]
  reason: SkipReason | 'parent'
}

export function ImportDone({
  board,
  file,
  result,
  skipped,
  onClose
}: {
  board: Board
  file: CsvFile
  result: ImportResult
  skipped: Skipped[]
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  return (
    <>
      <DialogContent>
        <Typography role="status">
          {t('csv.done', { smart_count: result.imported })}
          {skipped.length > 0 &&
            ` ${t('csv.skipped', { smart_count: skipped.length })}`}
        </Typography>
        {skipped.length > 0 && (
          <Button
            variant="text"
            className="u-mt-half"
            onClick={() => {
              download(
                file.name.replace(
                  /(\.csv)?$/i,
                  ` ${t('csv.skippedSuffix')}.csv`
                ),
                toCsv([
                  [...file.headers, t('csv.columns.reason')],
                  ...skipped.map(({ cells, reason }) => [
                    ...file.headers.map((_, index) => cells[index] ?? ''),
                    t(`csv.reasons.${reason}`)
                  ])
                ])
              )
            }}
          >
            {t('csv.downloadSkipped')}
          </Button>
        )}
        {result.unknownAssignees.length > 0 && (
          <Alert severity="info" className="u-mt-1">
            {t('csv.unknownAssignees', {
              names: result.unknownAssignees.join(', ')
            })}
          </Alert>
        )}
        {result.unplacedSections.length > 0 && (
          <Alert severity="info" className="u-mt-1">
            {t('csv.unplacedSections', {
              section: defaultSection(board.sections)?.name ?? '',
              names: result.unplacedSections.join(', ')
            })}
          </Alert>
        )}
      </DialogContent>
      <Divider />
      <DialogActions>
        <Button variant="contained" onClick={onClose}>
          {t('csv.close')}
        </Button>
      </DialogActions>
    </>
  )
}
