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
import { useEffect, useId, useRef, useState, type ReactElement } from 'react'

import type { TransferPreview } from '@/application/boards'
import { keptSection } from '@/application/viewTask'
import {
  isEditable,
  type BoardSummary,
  type Section,
  type Task
} from '@/domain/board'
import { displayName } from '@/domain/person'
import {
  useBoard,
  useBoards,
  usePreviewTransfer,
  useTransferTask
} from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

// The task keeps its status if the board has one of that name, else it takes
// the board's default.
function SectionSelect({
  boardId,
  kept,
  value,
  onChange
}: {
  boardId: string
  kept: { sections: readonly Section[]; sectionId: string | null }
  value: string | null | undefined
  onChange: (sectionId: string | null) => void
}): ReactElement | null {
  const { t } = useI18n()
  const sections = useBoard(boardId).data?.sections
  const first = sections
    ? (keptSection(kept.sections, kept.sectionId, sections)?.id ?? null)
    : null
  useEffect(() => {
    if (sections && value === undefined) onChange(first)
  }, [sections, value, first, onChange])
  if (!sections || value === undefined) return null
  return (
    <TextField
      select
      fullWidth
      margin="dense"
      label={t('transfer.section')}
      value={value ?? ''}
      onChange={event => {
        onChange(event.target.value === '' ? null : event.target.value)
      }}
      slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
    >
      <option value="">{t('board.noSection')}</option>
      {sections.map(section => (
        <option key={section.id} value={section.id}>
          {section.name}
        </option>
      ))}
    </TextField>
  )
}

function personName(
  person: TransferPreview['droppedAssignees'][number],
  former: string
): string {
  return !person.email && !person.name?.trim()
    ? former
    : displayName({ email: person.email ?? '', name: person.name })
}

export function ConfirmTransfer({
  task,
  board,
  preview,
  busy,
  failed,
  onCancel,
  onConfirm
}: {
  task: Task
  board: string
  preview: TransferPreview
  busy: boolean
  failed: boolean
  onCancel: () => void
  onConfirm: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const descriptionId = useId()
  const people = preview.droppedAssignees.map(person =>
    personName(person, t('transfer.formerMember'))
  )
  // The buttons are disabled while the move is under way, which would drop the
  // focus out of the dialog.
  const status = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (busy) status.current?.focus()
  }, [busy])
  return (
    <Dialog
      open
      onClose={() => {
        if (!busy) onCancel()
      }}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      slotProps={{ paper: { 'aria-busy': busy } }}
      size="small"
    >
      <DialogTitle id={titleId}>
        {t('transfer.confirmTitle', { title: task.title })}
      </DialogTitle>
      <DialogContent>
        <div id={descriptionId}>
          {people.length > 0 && (
            <Typography
              data-testid="transfer-dropped-assignees"
              className="u-mb-1"
            >
              {t('transfer.droppedAssignees', {
                board,
                names: people.join(', ')
              })}
            </Typography>
          )}
          {preview.createdLabels.length > 0 && (
            <Typography data-testid="transfer-created-labels">
              {t('transfer.createdLabels', {
                board,
                names: preview.createdLabels.join(', ')
              })}
            </Typography>
          )}
        </div>
        <div ref={status} role="status" tabIndex={-1} className="u-mt-1">
          {busy && t('transfer.moving')}
        </div>
        {failed && (
          <Typography role="alert" color="error" className="u-mt-1">
            {t('transfer.failed')}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="text" disabled={busy} onClick={onCancel}>
          {t('transfer.cancel')}
        </Button>
        <Button disabled={busy} onClick={onConfirm}>
          {t('transfer.moveAnyway')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

const isTarget = (board: BoardSummary, boardId: string) =>
  board.id !== boardId && isEditable(board)

export function useTransferable(task: Task, boardId: string): boolean {
  const boards = useBoards()
  return (
    task.parentId === null &&
    (boards.data?.some(board => isTarget(board, boardId)) ?? false)
  )
}

export function TransferDialog({
  task,
  boardId,
  onMoved,
  onClose
}: {
  task: Task
  boardId: string
  onMoved: () => void
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="small">
      <DialogTitle id={titleId}>{t('transfer.title')}</DialogTitle>
      <TransferTask
        task={task}
        boardId={boardId}
        onMoved={onMoved}
        onCancel={onClose}
      />
    </Dialog>
  )
}

function TransferTask({
  task,
  boardId,
  onMoved,
  onCancel
}: {
  task: Task
  boardId: string
  onMoved: () => void
  onCancel: () => void
}): ReactElement | null {
  const { t } = useI18n()
  const boards = useBoards()
  const [target, setTarget] = useState('')
  const from = useBoard(boardId).data?.sections ?? []
  // Undefined until the target board loads and the task's status is chosen.
  const [sectionId, setSectionId] = useState<string | null>()
  const [preview, setPreview] = useState<TransferPreview | null>(null)
  const [removed, setRemoved] = useState<TransferPreview | null>(null)
  const { transfer, refresh } = useTransferTask(boardId, task.id)
  const check = usePreviewTransfer(boardId, task.id)
  // The board is refreshed once the notice is read, or when the form goes away
  // without that, as when the person closes the dialog around it.
  const dismissButton = useRef<HTMLButtonElement>(null)
  const stale = useRef(false)
  const refreshNow = useRef(refresh)
  useEffect(() => {
    refreshNow.current = refresh
  })
  useEffect(
    () => () => {
      if (stale.current) void refreshNow.current()
    },
    []
  )
  const noticeShown = removed !== null
  useEffect(() => {
    if (noticeShown) dismissButton.current?.focus()
  }, [noticeShown])
  const finish = () => {
    stale.current = false
    void refresh()
    onMoved()
  }
  const to = { boardId: target, sectionId: sectionId ?? null }
  // `expected` is what the person was told, so a difference is worth saying.
  const move = (expected: TransferPreview) => {
    transfer.mutate(to, {
      onSuccess: result => {
        stale.current = true
        setPreview(null)
        const told = new Set(expected.droppedAssignees.map(p => p.userId))
        const same =
          result.droppedAssignees.length === told.size &&
          result.droppedAssignees.every(p => told.has(p.userId))
        if (same || result.droppedAssignees.length === 0) finish()
        else setRemoved(result)
      }
    })
  }
  const targets = boards.data?.filter(board => isTarget(board, boardId)) ?? []
  if (targets.length === 0) return null
  const targetName = targets.find(board => board.id === target)?.name ?? ''
  // Unmounting mid-request drops the mutate callbacks, so the move would land
  // without the board refreshing.
  const busy = check.isPending || transfer.isPending

  return (
    <form
      aria-label={t('transfer.title')}
      onSubmit={event => {
        event.preventDefault()
        check.mutate(to, {
          onSuccess: result => {
            if (result.droppedAssignees.length === 0) move(result)
            else {
              transfer.reset()
              setPreview(result)
            }
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
          }}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
        >
          <option value="" />
          {targets.map(board => (
            <option key={board.id} value={board.id}>
              {board.name}
            </option>
          ))}
        </TextField>
        {target && (
          <SectionSelect
            boardId={target}
            kept={{ sections: from, sectionId: task.sectionId }}
            value={sectionId}
            onChange={setSectionId}
          />
        )}
        {removed && (
          <Alert
            role="alert"
            severity="warning"
            className="u-mt-1"
            action={
              <Button
                ref={dismissButton}
                color="inherit"
                size="small"
                onClick={finish}
              >
                {t('transfer.dismiss')}
              </Button>
            }
          >
            {t('transfer.removedAssignees', {
              board: targetName,
              names: removed.droppedAssignees
                .map(person => personName(person, t('transfer.formerMember')))
                .join(', ')
            })}
          </Alert>
        )}
        {(check.isError || (transfer.isError && !preview)) && (
          <Typography role="alert" color="error" className="u-mt-1">
            {t('transfer.failed')}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          variant="text"
          disabled={busy}
          onClick={removed ? finish : onCancel}
        >
          {t('transfer.cancel')}
        </Button>
        <Button
          type="submit"
          disabled={sectionId === undefined || busy || !!removed}
        >
          {t('transfer.move')}
        </Button>
      </DialogActions>
      {preview && (
        <ConfirmTransfer
          task={task}
          board={targetName}
          preview={preview}
          busy={transfer.isPending}
          failed={transfer.isError}
          onCancel={() => {
            transfer.reset()
            setPreview(null)
          }}
          onConfirm={() => {
            move(preview)
          }}
        />
      )}
    </form>
  )
}
