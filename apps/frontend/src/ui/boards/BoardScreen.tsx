import { Button, Link, TextField, Typography } from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'
import { Link as RouterLink, useParams } from 'react-router'

import { ApiError } from '@/application/boards'
import { Column, Columns } from '@/ds/Columns'
import type { Board } from '@/domain/board'
import { useBoard, useCreateTask, useMoveTask } from '@/ui/boards/queries'
import { TaskCard } from '@/ui/boards/TaskCard'
import { useI18n } from '@/ui/i18n/useI18n'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

export function BoardScreen(): ReactElement {
  const { t } = useI18n()
  const { boardId = '' } = useParams()
  const board = useBoard(boardId)
  useDocumentTitle(board.data?.name ?? null)

  return (
    <main className="u-p-2">
      <Link component={RouterLink} to="/">
        {t('board.back')}
      </Link>
      {board.isError && (
        <Typography role="alert" className="u-mt-2">
          {board.error instanceof ApiError && board.error.status === 404
            ? t('board.notFound')
            : t('board.loadFailed')}
        </Typography>
      )}
      {board.data && <BoardColumns board={board.data} />}
    </main>
  )
}

function BoardColumns({ board }: { board: Board }): ReactElement {
  const { t } = useI18n()
  const move = useMoveTask(board.id)
  const editable = board.role !== 'viewer' && !board.archived
  const loose =
    board.sections.length === 0 ||
    board.tasks.some(task => task.sectionId === null)
  const columns = [
    ...(loose ? [{ id: null, name: t('board.noSection') }] : []),
    ...board.sections
  ]

  return (
    <>
      <Typography variant="h3" component="h1" className="u-mt-1 u-mb-2">
        {board.name}
      </Typography>
      {move.isError && (
        <Typography role="alert" className="u-mb-1">
          {t('board.moveFailed')}
        </Typography>
      )}
      <Columns>
        {columns.map(column => {
          const tasks = board.tasks.filter(task => task.sectionId === column.id)
          return (
            <Column
              key={column.id ?? 'none'}
              title={column.name}
              count={tasks.length}
            >
              {tasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  destinations={board.sections.filter(
                    section => section.id !== task.sectionId
                  )}
                  onMove={
                    editable
                      ? sectionId => {
                          move.mutate({ taskId: task.id, move: { sectionId } })
                        }
                      : undefined
                  }
                />
              ))}
              {editable && (
                <AddTask
                  boardId={board.id}
                  sectionId={column.id}
                  sectionName={column.name}
                />
              )}
            </Column>
          )
        })}
      </Columns>
    </>
  )
}

// A stable callback ref: an inline one is re-invoked on every render and steals focus.
const focusOnMount = (input: HTMLInputElement | null): void => {
  input?.focus()
}

function AddTask({
  boardId,
  sectionId,
  sectionName
}: {
  boardId: string
  sectionId: string | null
  sectionName: string
}): ReactElement {
  const { t } = useI18n()
  const create = useCreateTask(boardId)
  const [title, setTitle] = useState<string | null>(null)

  if (title === null) {
    return (
      <Button
        variant="text"
        onClick={() => {
          setTitle('')
        }}
        aria-label={t('board.addTask', { section: sectionName })}
      >
        +
      </Button>
    )
  }
  return (
    <form
      onSubmit={event => {
        event.preventDefault()
        create.mutate(
          { sectionId, title: title.trim() },
          {
            onSuccess: () => {
              setTitle('')
            }
          }
        )
      }}
    >
      <TextField
        label={t('board.taskTitle')}
        value={title}
        onChange={event => {
          setTitle(event.target.value)
        }}
        size="small"
        fullWidth
        inputRef={focusOnMount}
        slotProps={{ htmlInput: { maxLength: 500 } }}
      />
      {create.isError && (
        <Typography role="alert" variant="caption">
          {t('board.addFailed')}
        </Typography>
      )}
      <Button
        type="submit"
        size="small"
        className="u-mt-1"
        disabled={create.isPending || !title.trim()}
      >
        {t('board.add')}
      </Button>
    </form>
  )
}
