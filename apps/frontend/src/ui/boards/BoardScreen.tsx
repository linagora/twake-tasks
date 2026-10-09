import { Compass, Icon, Left, Plus, Share } from '@linagora/twake-icons'
import {
  Alert,
  Button,
  ClickAwayListener,
  Link,
  TextField,
  Tooltip,
  Typography
} from '@linagora/twake-mui'
import { useRef, useState, type ReactElement } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router'

import { ApiError, type Shelf } from '@/application/boards'
import {
  Card,
  CardTitle,
  Column,
  ColumnAddButton,
  Columns,
  ColumnsSkeleton,
  EmptyColumn
} from '@/ds/Columns'
import { EmptyState } from '@/ds/EmptyState'
import { PageHeader, UnavailableButton } from '@/ds/PageHeader'
import { Inline } from '@/ds/SidePanel'
import { DropColumn, SortableList } from '@/ds/Sortable'
import { TitleButton } from '@/ds/TitleButton'
import type { Board, Section, Task } from '@/domain/board'
import {
  RemovalNotice,
  RemovalNotices,
  type Removal
} from '@/ui/boards/Archive'
import { BoardDrag } from '@/ui/boards/BoardDrag'
import { BoardMenu } from '@/ui/boards/BoardMenu'
import { CalendarTask } from '@/ui/boards/CalendarTask'
import { localToday } from '@/ui/boards/dueLabel'
import { CalendarLayout, LayoutSwitch, ListLayout } from '@/ui/boards/Layouts'
import { MembersDialog, MemberStack } from '@/ui/boards/MembersDialog'
import { MoveBoardDialog, useMoveTargets } from '@/ui/boards/MoveBoardDialog'
import { NewDatedTask } from '@/ui/boards/NewDatedTask'
import {
  useBoard,
  useCreateTask,
  useMoveTask,
  useRenameBoard
} from '@/ui/boards/queries'
import { NewSectionButton, SectionMenu } from '@/ui/boards/SectionControls'
import { ShareDialog } from '@/ui/boards/ShareDialog'
import { TaskCard } from '@/ui/boards/TaskCard'
import { TaskListRow } from '@/ui/boards/TaskListRow'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

export function BoardScreen({
  back = true,
  waiting = false
}: {
  back?: boolean
  waiting?: boolean
}): ReactElement {
  const { t } = useI18n()
  const { boardId = '' } = useParams()
  const board = useBoard(boardId)
  useDocumentTitle(board.data?.name ?? null)
  const missing = board.error instanceof ApiError && board.error.status === 404

  return (
    <main className="u-p-2">
      {!board.data && back && <BackLink />}
      {missing && (
        <EmptyState
          icon={Compass}
          title={t('board.notFound')}
          text={t('problems.notFoundHint')}
        />
      )}
      {board.isError && !missing && (
        <Typography role="alert" className="u-mt-2">
          {t('board.loadFailed')}
        </Typography>
      )}
      {(board.isPending || (waiting && !board.isError)) && (
        <ColumnsSkeleton label={t('app.loading')} />
      )}
      {board.data && !waiting && (
        <BoardColumns board={board.data} back={back} />
      )}
    </main>
  )
}

function BackLink(): ReactElement {
  const { t } = useI18n()
  return (
    <Link
      component={RouterLink}
      to="../.."
      relative="path"
      variant="body2"
      color="textSecondary"
      underline="hover"
      className="u-flex u-flex-items-center"
    >
      <Icon icon={Left} size={12} className="u-mr-half" />
      {t('board.back')}
    </Link>
  )
}

function BoardColumns({
  board,
  back
}: {
  board: Board
  back: boolean
}): ReactElement {
  const { t } = useI18n()
  const move = useMoveTask(board.id)
  const editable = board.role !== 'viewer' && !board.archived
  const manageable = board.role === 'admin' && !board.archived
  const shareable =
    manageable && !board.project.personal && !board.project.managed
  const [sharing, setSharing] = useState(false)
  const [listing, setListing] = useState(false)
  const whyNot = board.project.personal
    ? t('sharing.personalBoard')
    : board.project.managed
      ? t('sharing.managedBoard')
      : board.archived
        ? t('sharing.archivedBoard')
        : board.role !== 'admin'
          ? t('sharing.adminOnly')
          : null
  const [moving, setMoving] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const renamable = manageable && !board.inbox
  const targets = useMoveTargets(board)
  const movable = shareable && targets.length > 0
  const navigate = useNavigate()
  const openShelf = (shelf: Shelf): void => {
    void navigate(shelf)
  }
  const [removal, setRemoval] = useState<Removal | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const stopAdding = (key: string): void => {
    setAdding(current => (current === key ? null : current))
  }
  const topLevel = board.tasks.filter(task => task.parentId === null)
  const loose =
    board.sections.length === 0 ||
    topLevel.some(task => task.sectionId === null)
  const columns: { id: string | null; name: string; section?: Section }[] = [
    ...(loose ? [{ id: null, name: t('board.noSection') }] : []),
    ...board.sections.map(section => ({ ...section, section }))
  ]

  const byId = new Map(topLevel.map(task => [task.id, task]))
  const card = (task: Task, sortable = false) => (
    <TaskCard
      key={task.id}
      sortable={sortable}
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
  const columnKey = (column: (typeof columns)[number]) => column.id ?? 'none'
  const laneKey = (column: (typeof columns)[number]) =>
    `lane:${columnKey(column)}`
  const addTask = (column: (typeof columns)[number]) =>
    editable && (
      <AddTask
        boardId={board.id}
        sectionId={column.id}
        sectionName={column.name}
        open={adding === columnKey(column)}
        onOpen={() => {
          setAdding(columnKey(column))
        }}
        onClose={() => {
          stopAdding(columnKey(column))
        }}
      />
    )
  const first = columns[0]
  const tasksIn = (column: (typeof columns)[number]) =>
    topLevel.filter(task => task.sectionId === column.id)

  return (
    <RemovalNotices.Provider value={setRemoval}>
      <PageHeader
        back={back && <BackLink />}
        title={
          <BoardTitle
            board={board}
            renaming={renaming}
            onRename={setRenaming}
          />
        }
        actions={
          <>
            <LayoutSwitch board={board} />
            {board.members.length > 0 && (
              <MemberStack
                members={board.members}
                onClick={() => {
                  if (shareable) setSharing(true)
                  else setListing(true)
                }}
              />
            )}
            {shareable ? (
              <Button
                variant="secondary"
                startIcon={<Icon icon={Share} />}
                onClick={() => {
                  setSharing(true)
                }}
              >
                {t('sharing.share')}
              </Button>
            ) : (
              <Tooltip title={whyNot ?? ''} describeChild>
                <UnavailableButton
                  variant="secondary"
                  startIcon={<Icon icon={Share} />}
                  aria-disabled="true"
                  disableRipple
                >
                  {t('sharing.share')}
                </UnavailableButton>
              </Tooltip>
            )}
            {editable && first && (
              <Button
                startIcon={<Icon icon={Plus} />}
                onClick={() => {
                  setAdding(columnKey(first))
                }}
              >
                {t('board.newTask')}
              </Button>
            )}
            <BoardMenu
              board={board}
              onOpenShelf={openShelf}
              onRename={
                renamable
                  ? () => {
                      setRenaming(true)
                    }
                  : undefined
              }
              onMove={
                movable
                  ? () => {
                      setMoving(true)
                    }
                  : undefined
              }
            />
          </>
        }
      />
      {board.archived && (
        <Alert severity="info" className="u-mb-1">
          {t('archive.boardArchived')}
        </Alert>
      )}
      {sharing && (
        <ShareDialog
          board={board}
          onClose={() => {
            setSharing(false)
          }}
        />
      )}
      {listing && (
        <MembersDialog
          board={board}
          onClose={() => {
            setListing(false)
          }}
        />
      )}
      {moving && (
        <MoveBoardDialog
          board={board}
          onClose={() => {
            setMoving(false)
          }}
        />
      )}
      {move.isError && (
        <Typography role="alert" className="u-mb-1">
          {t('board.moveFailed')}
        </Typography>
      )}
      {board.layout === 'board' && !editable && (
        <Columns>
          {columns.map(column => (
            <Column
              key={columnKey(column)}
              title={column.name}
              count={tasksIn(column).length}
            >
              {tasksIn(column).map(task => card(task))}
              {tasksIn(column).length === 0 && (
                <EmptyColumn label={t('board.emptyColumn')} />
              )}
            </Column>
          ))}
        </Columns>
      )}
      {board.layout === 'board' && editable && (
        <BoardDrag
          lanes={columns.map(column => ({
            key: laneKey(column),
            sectionId: column.id,
            name: column.name,
            taskIds: tasksIn(column).map(task => task.id)
          }))}
          titleOf={id => {
            const task = byId.get(id)
            return task ? `${task.key} ${task.title}` : ''
          }}
          onMove={(taskId, to) => {
            move.mutate({ taskId, move: to })
          }}
          preview={id => {
            const task = byId.get(id)
            return (
              task && (
                <Card label={`${task.key} ${task.title}`} drag="lifted">
                  <Typography variant="caption" color="textSecondary">
                    {task.key}
                  </Typography>
                  <CardTitle>{task.title}</CardTitle>
                </Card>
              )
            )
          }}
        >
          {idsOf => (
            <Columns>
              {columns.map(column => {
                const ids = idsOf(laneKey(column))
                return (
                  <DropColumn
                    key={columnKey(column)}
                    id={laneKey(column)}
                    title={column.name}
                    count={ids.length}
                    actions={
                      manageable &&
                      column.section && (
                        <SectionMenu board={board} section={column.section} />
                      )
                    }
                  >
                    <SortableList ids={ids}>
                      {ids.flatMap(id => {
                        const task = byId.get(id)
                        return task ? [card(task, true)] : []
                      })}
                    </SortableList>
                    {ids.length === 0 && (
                      <EmptyColumn label={t('board.emptyColumn')} />
                    )}
                    {addTask(column)}
                  </DropColumn>
                )
              })}
              {manageable && <NewSectionButton board={board} />}
            </Columns>
          )}
        </BoardDrag>
      )}
      {board.layout === 'list' && (
        <ListLayout
          columns={columns.map(column => ({
            key: column.id ?? 'none',
            name: column.name,
            tasks: tasksIn(column),
            footer: addTask(column)
          }))}
          row={task => (
            <TaskListRow
              key={task.id}
              task={task}
              boardId={board.id}
              sections={board.sections}
              editable={editable}
            />
          )}
        />
      )}
      {board.layout === 'calendar' && (
        <CalendarLayout
          tasks={topLevel}
          item={task => (
            <CalendarTask
              key={task.id}
              task={task}
              boardId={board.id}
              editable={editable}
            />
          )}
        />
      )}
      {board.layout === 'calendar' && first && adding !== null && (
        <NewDatedTask
          boardId={board.id}
          sectionId={first.id}
          day={localToday()}
          onClose={() => {
            setAdding(null)
          }}
        />
      )}
      {removal && (
        <RemovalNotice
          key={`${removal.shelf}:${removal.task.id}`}
          board={board}
          removal={removal}
          onOpenShelf={openShelf}
          onClose={() => {
            setRemoval(null)
          }}
        />
      )}
    </RemovalNotices.Provider>
  )
}

function BoardTitle({
  board,
  renaming,
  onRename
}: {
  board: Board
  renaming: boolean
  onRename: (renaming: boolean) => void
}): ReactElement {
  const { t } = useI18n()
  const renamable = board.role === 'admin' && !board.archived && !board.inbox
  // The title takes the focus back from an editor that just closed
  const [returned, setReturned] = useState(false)

  if (renaming && renamable) {
    return (
      <TitleEditor
        board={board}
        onDone={() => {
          setReturned(true)
          onRename(false)
        }}
      />
    )
  }
  return (
    <Typography variant="h3" component="h1" noWrap>
      {renamable ? (
        <Tooltip title={t('board.rename')} describeChild>
          <TitleButton
            focusOnMount={returned}
            onClick={() => {
              setReturned(false)
              onRename(true)
            }}
          >
            {board.name}
          </TitleButton>
        </Tooltip>
      ) : (
        board.name
      )}
    </Typography>
  )
}

// Mounted for one edit: its draft and its guard start afresh each time
function TitleEditor({
  board,
  onDone
}: {
  board: Board
  onDone: () => void
}): ReactElement {
  const { t } = useI18n()
  const rename = useRenameBoard(board.id)
  const [name, setName] = useState(board.name)
  // A blur follows Enter or Escape: save once
  const settled = useRef(false)

  const stop = (): void => {
    settled.current = true
    onDone()
  }
  const save = (): void => {
    if (settled.current || rename.isPending) return
    const next = name.trim()
    if (!next || next === board.name) {
      stop()
      return
    }
    rename.mutate(next, { onSuccess: stop })
  }

  return (
    <>
      <TextField
        label={t('board.renameName')}
        value={name}
        onChange={event => {
          setName(event.target.value)
        }}
        onKeyDown={event => {
          if (rename.isPending || event.nativeEvent.isComposing) return
          if (event.key === 'Enter') {
            event.preventDefault()
            save()
          } else if (event.key === 'Escape') {
            stop()
          }
        }}
        onBlur={save}
        size="small"
        fullWidth
        inputRef={focusOnMount}
        slotProps={{
          htmlInput: { maxLength: 100, readOnly: rename.isPending }
        }}
      />
      {rename.isError && (
        <Typography role="alert" variant="caption">
          {t('board.renameFailed')}
        </Typography>
      )}
    </>
  )
}

function AddTask({
  boardId,
  sectionId,
  sectionName,
  open,
  onOpen,
  onClose
}: {
  boardId: string
  sectionId: string | null
  sectionName: string
  open: boolean
  onOpen: () => void
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const create = useCreateTask(boardId)
  const [title, setTitle] = useState('')
  const refocus = useRef(false)
  const close = () => {
    refocus.current = true
    setTitle('')
    create.reset()
    onClose()
  }

  if (!open) {
    return (
      <ColumnAddButton
        ref={(node: HTMLButtonElement | null) => {
          if (node && refocus.current) {
            refocus.current = false
            node.focus()
          }
        }}
        variant="text"
        fullWidth
        startIcon={<Icon icon={Plus} />}
        onClick={onOpen}
        aria-label={t('board.addTask', { section: sectionName })}
      >
        {t('board.newTask')}
      </ColumnAddButton>
    )
  }
  return (
    <ClickAwayListener onClickAway={onClose}>
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
          onKeyDown={event => {
            if (event.key === 'Escape') close()
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
        <Inline>
          <Button
            type="submit"
            size="small"
            className="u-mt-1"
            disabled={create.isPending || !title.trim()}
          >
            {t('board.add')}
          </Button>
          <Button
            variant="text"
            size="small"
            className="u-mt-1"
            onClick={close}
          >
            {t('board.cancel')}
          </Button>
        </Inline>
      </form>
    </ClickAwayListener>
  )
}
