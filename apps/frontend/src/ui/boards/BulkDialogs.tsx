import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography
} from '@linagora/twake-mui'
import { useId, useState, type ReactElement } from 'react'

import type { TransferPreview } from '@/application/boards'
import { useBoardName } from '@/ui/boards/BoardsScreen'
import { isTarget, personName, SectionSelect } from '@/ui/boards/TransferTask'
import { useBoards } from '@/ui/queries/boards'
import { usePreviewTasksTransfer } from '@/ui/queries/tasks'
import { useI18n } from '@/ui/i18n/useI18n'

export interface TransferTarget {
  boardId: string
  sectionId: string | null
  name: string
}

export function BulkDeleteDialog({
  count,
  onDelete,
  onClose
}: {
  count: number
  onDelete: () => void
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="small">
      <DialogTitle id={titleId}>
        {t('bulk.deleteTitle', { smart_count: count })}
      </DialogTitle>
      <DialogContent>
        <Typography>{t('bulk.deleteText', { smart_count: count })}</Typography>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onClose}>
          {t('archive.cancel')}
        </Button>
        <Button color="error" onClick={onDelete}>
          {t('archive.delete')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/**
 * Picks the board and section the tasks go to, and asks first when people
 * would be unassigned on the way.
 */
export function BulkTransferDialog({
  boardId,
  taskIds,
  onMove,
  onClose
}: {
  boardId: string
  taskIds: string[]
  onMove: (to: TransferTarget) => void
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const boardName = useBoardName()
  const targets =
    useBoards().data?.filter(board => isTarget(board, boardId)) ?? []
  const [target, setTarget] = useState('')
  // Undefined until the target board loads and its first section is chosen.
  const [sectionId, setSectionId] = useState<string | null>()
  const [warning, setWarning] = useState<TransferPreview | null>(null)
  const check = usePreviewTasksTransfer(boardId, taskIds)
  const picked = targets.find(board => board.id === target)
  const to = {
    boardId: target,
    sectionId: sectionId ?? null,
    name: picked ? boardName(picked) : ''
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="small">
      <DialogTitle id={titleId}>
        {t('bulk.transferTitle', { smart_count: taskIds.length })}
      </DialogTitle>
      <form
        aria-label={t('transfer.title')}
        onSubmit={event => {
          event.preventDefault()
          if (warning) {
            onMove(to)
            return
          }
          check.mutate(to, {
            onSuccess: preview => {
              if (preview.droppedAssignees.length === 0) onMove(to)
              else setWarning(preview)
            }
          })
        }}
      >
        <DialogContent>
          <TextField
            select
            fullWidth
            margin="dense"
            label={t('transfer.board')}
            value={target}
            onChange={event => {
              setTarget(event.target.value)
              setSectionId(undefined)
              setWarning(null)
            }}
            slotProps={{
              select: { native: true },
              inputLabel: { shrink: true }
            }}
          >
            <option value="" />
            {targets.map(board => (
              <option key={board.id} value={board.id}>
                {boardName(board)}
              </option>
            ))}
          </TextField>
          {target && (
            <SectionSelect
              boardId={target}
              value={sectionId}
              onChange={setSectionId}
            />
          )}
          {warning && (
            <Alert role="alert" severity="warning" className="u-mt-1">
              {t('transfer.droppedAssignees', {
                board: to.name,
                names: warning.droppedAssignees
                  .map(person => personName(person, t('transfer.formerMember')))
                  .join(', ')
              })}
              {warning.createdLabels.length > 0 &&
                ` ${t('transfer.createdLabels', {
                  board: to.name,
                  names: warning.createdLabels.join(', ')
                })}`}
            </Alert>
          )}
          {check.isError && (
            <Typography role="alert" color="error" className="u-mt-1">
              {t('bulk.failed')}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={onClose}>
            {t('transfer.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={sectionId === undefined || check.isPending}
          >
            {t(warning ? 'transfer.moveAnyway' : 'transfer.move')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
