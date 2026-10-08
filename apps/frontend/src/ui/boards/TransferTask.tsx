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
import type { Task } from '@/domain/board'
import { displayName } from '@/domain/person'
import {
  useBoard,
  useBoards,
  usePreviewTransfer,
  useTransferTask
} from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

function SectionSelect({
  boardId,
  value,
  onChange
}: {
  boardId: string
  value: string
  onChange: (sectionId: string) => void
}): ReactElement {
  const { t } = useI18n()
  const board = useBoard(boardId)
  return (
    <TextField
      select
      size="small"
      className="u-mr-1"
      label={t('transfer.section')}
      value={value}
      onChange={event => {
        onChange(event.target.value)
      }}
      slotProps={{ select: { native: true } }}
    >
      <option value="">{t('board.noSection')}</option>
      {board.data?.sections.map(section => (
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
  return person.email === null && !person.name?.trim()
    ? former
    : displayName({ email: person.email ?? '', name: person.name })
}

function ConfirmTransfer({
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
  return (
    <Dialog
      open
      onClose={onCancel}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
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
        {failed && (
          <Typography role="alert" color="error" className="u-mt-1">
            {t('transfer.failed')}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onCancel}>
          {t('transfer.cancel')}
        </Button>
        <Button disabled={busy} onClick={onConfirm}>
          {t('transfer.moveAnyway')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export function TransferTask({
  task,
  boardId,
  onMoved
}: {
  task: Task
  boardId: string
  onMoved: () => void
}): ReactElement | null {
  const { t } = useI18n()
  const boards = useBoards()
  const [target, setTarget] = useState('')
  const [sectionId, setSectionId] = useState('')
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
  // `expected` is what the person was told, so a difference is worth saying.
  const move = (expected: TransferPreview) => {
    transfer.mutate(
      { boardId: target, sectionId: sectionId || null },
      {
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
      }
    )
  }
  const targets =
    boards.data?.filter(
      board =>
        board.id !== boardId && board.role !== 'viewer' && !board.archived
    ) ?? []
  if (targets.length === 0) return null

  return (
    <form
      aria-label={t('transfer.title')}
      className="u-flex u-flex-items-center u-mt-1"
      onSubmit={event => {
        event.preventDefault()
        check.mutate(
          { boardId: target, sectionId: sectionId || null },
          {
            onSuccess: result => {
              if (result.droppedAssignees.length === 0) move(result)
              else {
                transfer.reset()
                setPreview(result)
              }
            }
          }
        )
      }}
    >
      <TextField
        select
        size="small"
        className="u-mr-1"
        label={t('transfer.board')}
        value={target}
        onChange={event => {
          setTarget(event.target.value)
          setSectionId('')
        }}
        slotProps={{ select: { native: true } }}
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
          value={sectionId}
          onChange={setSectionId}
        />
      )}
      <Button
        type="submit"
        disabled={!target || check.isPending || transfer.isPending || !!removed}
      >
        {t('transfer.move')}
      </Button>
      {preview && (
        <ConfirmTransfer
          task={task}
          board={targets.find(board => board.id === target)?.name ?? ''}
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
      {removed && (
        <Alert
          role="alert"
          severity="warning"
          className="u-ml-1"
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
            board: targets.find(board => board.id === target)?.name ?? '',
            names: removed.droppedAssignees
              .map(person => personName(person, t('transfer.formerMember')))
              .join(', ')
          })}
        </Alert>
      )}
      {(check.isError || (transfer.isError && !preview)) && (
        <Typography role="alert" className="u-ml-1">
          {t('transfer.failed')}
        </Typography>
      )}
    </form>
  )
}
