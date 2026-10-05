import { Button, Link, TextField, Typography } from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'
import { Link as RouterLink, useParams } from 'react-router'

import { ApiError, type Shelf } from '@/application/boards'
import { Column, Columns } from '@/ds/Columns'
import type { Board, Section, Task } from '@/domain/board'
import { ArchiveBoardButton, ShelfDialog } from '@/ui/boards/Archive'
import { CalendarLayout, LayoutSwitch, ListLayout } from '@/ui/boards/Layouts'
import { useBoard, useCreateTask, useMoveTask } from '@/ui/boards/queries'
import { NewSectionButton, SectionMenu } from '@/ui/boards/SectionControls'
import { ShareDialog } from '@/ui/boards/ShareDialog'
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
  const manageable = board.role === 'admin' && !board.archived
  const shareable = manageable && board.spaceId === null && !board.inbox
  const [sharing, setSharing] = useState(false)
  const [shelf, setShelf] = useState<Shelf | null>(null)
  const topLevel = board.tasks.filter(task => task.parentId === null)
  const loose =
    board.sections.length === 0 ||
    topLevel.some(task => task.sectionId === null)
  const columns: { id: string | null; name: string; section?: Section }[] = [
    ...(loose ? [{ id: null, name: t('board.noSection') }] : []),
    ...board.sections.map(section => ({ ...section, section }))
  ]

  const card = (task: Task) => (
    <TaskCard
      key={task.id}
      task={task}
      tasks={board.tasks}
      boardId={board.id}
      members={board.members}
      labels={board.labels}
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
  )
  const addTask = (column: (typeof columns)[number]) =>
    editable && (
      <AddTask
        boardId={board.id}
        sectionId={column.id}
        sectionName={column.name}
      />
    )
  const tasksIn = (column: (typeof columns)[number]) =>
    topLevel.filter(task => task.sectionId === column.id)

  return (
    <>
      <div className="u-flex u-flex-items-center u-mt-1 u-mb-2">
        <Typography variant="h3" component="h1">
          {board.name}
        </Typography>
        <LayoutSwitch board={board} />
        {shareable && (
          <Button
            variant="secondary"
            className="u-ml-1"
            onClick={() => {
              setSharing(true)
            }}
          >
            {t('sharing.share')}
          </Button>
        )}
        {(['archived', 'trash'] as const).map(each => (
          <Button
            key={each}
            variant="text"
            className="u-ml-1"
            onClick={() => {
              setShelf(each)
            }}
          >
            {t(each === 'archived' ? 'archive.archivedTasks' : 'archive.trash')}
          </Button>
        ))}
        {board.role === 'admin' && !board.inbox && (
          <ArchiveBoardButton board={board} />
        )}
      </div>
      {board.archived && (
        <Typography className="u-mb-1">{t('archive.boardArchived')}</Typography>
      )}
      {shelf && (
        <ShelfDialog
          board={board}
          shelf={shelf}
          onClose={() => {
            setShelf(null)
          }}
        />
      )}
      {sharing && (
        <ShareDialog
          board={board}
          onClose={() => {
            setSharing(false)
          }}
        />
      )}
      {move.isError && (
        <Typography role="alert" className="u-mb-1">
          {t('board.moveFailed')}
        </Typography>
      )}
      {board.layout === 'board' && (
        <Columns>
          {columns.map(column => (
            <Column
              key={column.id ?? 'none'}
              title={column.name}
              count={tasksIn(column).length}
              actions={
                manageable &&
                column.section && (
                  <SectionMenu board={board} section={column.section} />
                )
              }
            >
              {tasksIn(column).map(card)}
              {addTask(column)}
            </Column>
          ))}
          {manageable && <NewSectionButton board={board} />}
        </Columns>
      )}
      {board.layout === 'list' && (
        <ListLayout
          columns={columns.map(column => ({
            key: column.id ?? 'none',
            name: column.name,
            tasks: tasksIn(column),
            footer: addTask(column)
          }))}
          card={card}
        />
      )}
      {board.layout === 'calendar' && (
        <CalendarLayout tasks={topLevel} card={card} />
      )}
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
