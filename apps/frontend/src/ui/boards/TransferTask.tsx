import {
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
import type { Task } from '@/domain/board'
import { displayName } from '@/domain/person'
import {
  useBoard,
  useBoardChange,
  useBoards,
  usePreviewTransfer
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

function ConfirmTransfer({
  task,
  board,
  preview,
  busy,
  onCancel,
  onConfirm
}: {
  task: Task
  board: string
  preview: TransferPreview
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const people = preview.droppedAssignees.map(person =>
    displayName({ email: person.email ?? person.userId, name: person.name })
  )
  return (
    <Dialog open onClose={onCancel} aria-labelledby={titleId} size="small">
      <DialogTitle id={titleId}>
        {t('transfer.confirmTitle', { title: task.title })}
      </DialogTitle>
      <DialogContent>
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
  const transfer = useBoardChange(boardId, (api, to: string) =>
    api.transferTask(boardId, task.id, {
      boardId: to,
      sectionId: sectionId || null
    })
  )
  const check = usePreviewTransfer(boardId, task.id)
  const move = () => {
    transfer.mutate(target, { onSuccess: onMoved })
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
              if (result.droppedAssignees.length === 0) move()
              else setPreview(result)
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
        disabled={!target || check.isPending || transfer.isPending}
      >
        {t('transfer.move')}
      </Button>
      {preview && (
        <ConfirmTransfer
          task={task}
          board={targets.find(board => board.id === target)?.name ?? ''}
          preview={preview}
          busy={transfer.isPending}
          onCancel={() => {
            setPreview(null)
          }}
          onConfirm={move}
        />
      )}
      {(check.isError || transfer.isError) && (
        <Typography role="alert" className="u-ml-1">
          {t('transfer.failed')}
        </Typography>
      )}
    </form>
  )
}
