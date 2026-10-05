import { Button, TextField, Typography } from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'

import type { Task } from '@/domain/board'
import { useBoard, useBoardChange, useBoards } from '@/ui/boards/queries'
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
  const transfer = useBoardChange(boardId, (api, to: string) =>
    api.transferTask(boardId, task.id, {
      boardId: to,
      sectionId: sectionId || null
    })
  )
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
        transfer.mutate(target, { onSuccess: onMoved })
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
      <Button type="submit" disabled={!target || transfer.isPending}>
        {t('transfer.move')}
      </Button>
      {transfer.isError && (
        <Typography role="alert" className="u-ml-1">
          {t('transfer.failed')}
        </Typography>
      )}
    </form>
  )
}
