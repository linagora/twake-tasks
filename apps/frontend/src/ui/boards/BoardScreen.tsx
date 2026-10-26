import { Compass, Icon, Plus, Share } from '@linagora/twake-icons'
import {
  Alert,
  Button,
  Chip,
  ClickAwayListener,
  TextField,
  Tooltip,
  Typography,
  useAlert
} from '@linagora/twake-mui'
import { Fragment, useEffect, useRef, useState, type ReactElement } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'

import type { SectionMove, Shelf, TaskMove } from '@/application/boards'
import {
  Card,
  CardTitle,
  Column,
  ColumnAddButton,
  Columns,
  ColumnsSkeleton,
  EmptyColumn
} from '@/ds/Columns'
import { ListDragPreview } from '@/ds/ListView'
import { EmptyState } from '@/ds/EmptyState'
import { PageHeader, PageTitle, UnavailableButton } from '@/ds/PageHeader'
import { Inline } from '@/ds/SidePanel'
import {
  DropColumn,
  SortableColumn,
  SortableColumns,
  SortableList
} from '@/ds/Sortable'
import { CutTooltip } from '@/ds/CutTooltip'
import { TitleButton } from '@/ds/TitleButton'
import {
  isShareable,
  type Board,
  type Section,
  type Task
} from '@/domain/board'
import {
  RemovalNotice,
  RemovalNotices,
  type Removal
} from '@/ui/boards/Archive'
import { BoardDrag, columnSortId } from '@/ui/boards/BoardDrag'
import { BoardMenu } from '@/ui/boards/BoardMenu'
import { CalendarTask } from '@/ui/boards/CalendarTask'
import { CalendarLayout, LayoutSwitch, ListLayout } from '@/ui/boards/Layouts'
import { MembersDialog, MemberStack } from '@/ui/boards/MembersDialog'
import { MoveBoardDialog, useMoveTargets } from '@/ui/boards/MoveBoardDialog'
import {
  BoardStepsContext,
  OriginContext,
  PageCrumbs,
  useArchivesOrigin,
  useBoardsOrigin,
  type Origin
} from '@/ui/boards/Crumbs'
import {
  useBoardChange,
  useBoardOf,
  useListedBoard,
  useCreateTask,
  useHiddenTasks,
  useMoveTask,
  useRenameBoard,
  useSetBoardArchived
} from '@/ui/boards/queries'
import { markBoardSeen } from '@/ui/boards/seenBoards'
import { NewSectionButton, SectionMenu } from '@/ui/boards/SectionControls'
import { ShareDialog } from '@/ui/boards/ShareDialog'
import { useBoardBackground } from '@/ui/boards/Backgrounds'
import { TaskCard } from '@/ui/boards/TaskCard'
import { TaskListRow } from '@/ui/boards/TaskListRow'
import { LinkedTaskPanel } from '@/ui/boards/TaskPanel'
import { lineage } from '@/ui/boards/useTaskPanel'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'
import { useNewTaskParam } from '@/ui/shell/useNewTaskParam'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

export function BoardScreen({
  back = true,
  flush = false,
  waiting = false
}: {
  back?: boolean
  flush?: boolean
  waiting?: boolean
}): ReactElement {
  const { t } = useI18n()
  const { boardId = '', projectId } = useParams()
  const { board, shown, missing } = useBoardOf(boardId, projectId)
  // Opened from the boards, its name is known already: the breadcrumb shows it
  // at once rather than "…" then the name.
  const listed = useListedBoard(boardId)
  const name = shown?.name ?? (missing ? null : listed?.name) ?? '…'
  const boardsOrigin = {
    ...useBoardsOrigin(),
    to: '../..',
    relative: true
  }
  const archivesOrigin = useArchivesOrigin()
  // An archived board is reached from the Archives, as the sidebar shows,
  // except in an embed (flush), which has no Archives page.
  const origin =
    (shown ?? listed)?.archived && !flush ? archivesOrigin : boardsOrigin
  useDocumentTitle(shown?.name ?? null)
  const shownId = shown?.id
  useEffect(() => {
    if (shownId) markBoardSeen(shownId)
  }, [shownId])

  return (
    <OriginContext value={origin}>
      <BoardStepsContext value={[{ to: '.', label: name, relative: true }]}>
        <main
          className={
            flush
              ? undefined
              : 'u-ph-2 u-pt-half u-pb-2 u-flex u-flex-column u-mih-100'
          }
        >
          {/* Once loaded, the board titles itself with its breadcrumb. */}
          {back && !(shown && !waiting) && (
            // The size of the board's own title, so that nothing moves once it loads.
            <PageCrumbs origin={origin} current={name} heading />
          )}
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
          {(board.isPending || (waiting && !board.isError && !missing)) && (
            <ColumnsSkeleton label={t('app.loading')} />
          )}
          {shown && !waiting && (
            <BoardColumns
              board={shown}
              settled={!board.isFetching}
              origin={back ? origin : undefined}
              shareButton={!flush}
            />
          )}
        </main>
      </BoardStepsContext>
    </OriginContext>
  )
}

// A link can name a task the board no longer has, or never had. Each key is
// checked once, on fresh data: a task removed while its panel is open leaves
// its key in the URL for a moment, and a restored one is not in the cache yet.
function LinkedTask({
  board,
  editable,
  settled
}: {
  board: Board
  editable: boolean
  settled: boolean
}): ReactElement {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const shown = params.get('task')
  const rootKey =
    shown === null ? undefined : lineage(shown, board.tasks).at(-1)
  const root = board.tasks.find(task => task.key === rootKey)
  const [checked, setChecked] = useState<string | null>(null)
  const [lost, setLost] = useState<string | null>(null)

  if (shown !== checked && (shown === null || settled)) {
    setChecked(shown)
    if (shown !== null && !board.tasks.some(task => task.key === shown)) {
      setLost(shown)
    }
  }

  const looking = lost !== null && shown === lost
  const archived = useHiddenTasks(board.id, 'archived', looking)
  const trashed = useHiddenTasks(board.id, 'trash', looking)
  const shelf = archived.data?.some(task => task.key === lost)
    ? 'archived'
    : trashed.data?.some(task => task.key === lost)
      ? 'trash'
      : null
  const searching = archived.isFetching || trashed.isFetching
  const navigate = useNavigate()

  // Twake's alert says the task is gone, as other apps say theirs.
  const { showAlert } = useAlert()
  const full = params.get('panel') === 'full' ? '&panel=full' : ''
  useEffect(() => {
    if (!looking || searching) return
    if (shelf) {
      void navigate(`${shelf}?task=${encodeURIComponent(lost)}${full}`, {
        relative: 'path',
        replace: true
      })
      return
    }
    showAlert({
      message: t('board.taskNotFound'),
      severity: 'warning',
      duration: 8000
    })
    setParams(
      current => {
        const next = new URLSearchParams(current)
        next.delete('task')
        next.delete('panel')
        return next
      },
      { replace: true }
    )
  }, [looking, lost, shelf, full, searching, navigate, setParams, showAlert, t])

  return (
    <>
      {root && (
        <LinkedTaskPanel
          key={root.id}
          task={root}
          tasks={board.tasks}
          boardId={board.id}
          editable={editable}
          depth={1}
        />
      )}
    </>
  )
}

function BoardColumns({
  board,
  settled,
  origin,
  shareButton
}: {
  board: Board
  settled: boolean
  /** Where its breadcrumb starts, which then titles the page. */
  origin?: Origin | undefined
  /** Left out in an embed, whose host shares the project with its members. */
  shareButton: boolean
}): ReactElement {
  const { t } = useI18n()
  const move = useMoveTask(board.id)
  const moveSection = useBoardChange(
    board.id,
    (api, { sectionId, to }: { sectionId: string; to: SectionMove }) =>
      api.moveSection(board.id, sectionId, to)
  )
  // Only the column is lifted when it carries its cards along.
  const taskPreview = (task: Task, drag: 'lifted' | 'none' = 'lifted') => (
    <Card label={`${task.key} ${task.title}`} drag={drag}>
      <Typography variant="caption" color="textSecondary">
        {task.key}
      </Typography>
      <CardTitle>{task.title}</CardTitle>
    </Card>
  )
  const editable = board.role !== 'viewer' && !board.archived
  const manageable = board.role === 'admin' && !board.archived
  const backdrop = useBoardBackground(board)
  const shareable = isShareable(board)
  const [sharing, setSharing] = useState(false)
  const [listing, setListing] = useState(false)
  const whyNot = board.project.personal
    ? t('sharing.personalBoard')
    : board.project.managed
      ? t('sharing.managedBoard', { space: board.project.name })
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
  const { openNewTask } = useNewTaskParam()
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
      shareable={shareable}
      labels={board.labels}
      sections={board.sections}
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
  const tasksIn = (column: (typeof columns)[number]) =>
    topLevel.filter(task => task.sectionId === column.id)
  const listRow = (task: Task, sortable = false) => (
    <TaskListRow
      key={task.id}
      sortable={sortable}
      task={task}
      boardId={board.id}
      sections={board.sections}
      editable={editable}
    />
  )
  // The board and the list drag their tasks alike, among the sections.
  const drag = {
    lanes: columns.map(column => ({
      key: laneKey(column),
      sectionId: column.id,
      name: column.name,
      taskIds: tasksIn(column).map(task => task.id)
    })),
    titleOf: (id: string) => {
      const task = byId.get(id)
      return task ? `${task.key} ${task.title}` : ''
    },
    onMove: (taskId: string, to: TaskMove) => {
      move.mutate({ taskId, move: to })
    }
  }

  const headerActions = (
    <>
      <LayoutSwitch board={board} />
      {board.role !== 'admin' && (
        <Tooltip
          title={
            board.archived
              ? t('archive.boardArchived')
              : t(`board.${board.role}Hint`)
          }
          describeChild
        >
          <Chip
            variant="outlined"
            size="small"
            label={t(`sharing.roles.${board.role}`)}
            aria-haspopup="dialog"
            onClick={() => {
              setListing(true)
            }}
          />
        </Tooltip>
      )}
      {board.members.length + board.invited.length > 0 && (
        <MemberStack
          members={board.members}
          invited={board.invited}
          onClick={() => {
            if (shareable) setSharing(true)
            else setListing(true)
          }}
        />
      )}
      {!shareButton ? null : shareable ? (
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
  )

  return (
    <RemovalNotices.Provider value={setRemoval}>
      {origin ? (
        <PageCrumbs
          origin={origin}
          current={
            <BoardTitle
              board={board}
              renaming={renaming}
              onRename={setRenaming}
              bare
            />
          }
          // A heading would take the name of the field that renames it.
          heading={!renaming}
          actions={headerActions}
        />
      ) : (
        <PageHeader
          title={
            <BoardTitle
              board={board}
              renaming={renaming}
              onRename={setRenaming}
            />
          }
          actions={headerActions}
        />
      )}
      {board.archived && <ArchivedBanner board={board} />}
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
          reason={whyNot}
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
      {moveSection.isError && (
        <Typography role="alert" className="u-mb-1">
          {t('section.moveFailed')}
        </Typography>
      )}
      {board.layout === 'board' && !editable && (
        <Columns backdrop={backdrop}>
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
          {...drag}
          preview={id => {
            const task = byId.get(id)
            return task && taskPreview(task)
          }}
          columns={
            manageable
              ? {
                  ids: board.sections.map(section => section.id),
                  nameOf: id =>
                    board.sections.find(section => section.id === id)?.name ??
                    '',
                  onMove: (sectionId, to) =>
                    moveSection.mutateAsync({ sectionId, to }),
                  preview: id => {
                    const column = columns.find(each => each.id === id)
                    if (!column) return null
                    const tasks = tasksIn(column)
                    return (
                      <Column
                        title={column.name}
                        count={tasks.length}
                        drag="lifted"
                      >
                        {tasks.map(task => (
                          <Fragment key={task.id}>
                            {taskPreview(task, 'none')}
                          </Fragment>
                        ))}
                      </Column>
                    )
                  }
                }
              : undefined
          }
        >
          {(idsOf, order) => {
            const content = (column: (typeof columns)[number]) => {
              const ids = idsOf(laneKey(column))
              return {
                count: ids.length,
                actions: manageable && column.section && (
                  <SectionMenu board={board} section={column.section} />
                ),
                children: (
                  <>
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
                  </>
                )
              }
            }
            // No section stays first; the sections follow in the dragged order.
            const loose = columns.filter(column => column.id === null)
            const sections = (
              manageable ? order : board.sections.map(section => section.id)
            ).flatMap(id => columns.filter(column => column.id === id))
            return (
              <Columns backdrop={backdrop}>
                {loose.map(column => (
                  <DropColumn
                    key={columnKey(column)}
                    id={laneKey(column)}
                    title={column.name}
                    {...content(column)}
                  />
                ))}
                <SortableColumns
                  ids={sections.map(column => columnSortId(columnKey(column)))}
                >
                  {sections.map(column =>
                    manageable ? (
                      <SortableColumn
                        key={columnKey(column)}
                        id={laneKey(column)}
                        sortId={columnSortId(columnKey(column))}
                        description={t('drag.column')}
                        title={column.name}
                        {...content(column)}
                      />
                    ) : (
                      <DropColumn
                        key={columnKey(column)}
                        id={laneKey(column)}
                        title={column.name}
                        {...content(column)}
                      />
                    )
                  )}
                </SortableColumns>
                {manageable && <NewSectionButton board={board} />}
              </Columns>
            )
          }}
        </BoardDrag>
      )}
      {board.layout === 'list' && !editable && (
        <ListLayout
          columns={columns.map(column => ({
            key: column.id ?? 'none',
            name: column.name,
            tasks: tasksIn(column),
            footer: addTask(column)
          }))}
          row={listRow}
        />
      )}
      {board.layout === 'list' && editable && (
        <BoardDrag
          {...drag}
          previewAtPointer
          preview={id => {
            const task = byId.get(id)
            return (
              task && <ListDragPreview taskKey={task.key} title={task.title} />
            )
          }}
        >
          {idsOf => (
            <ListLayout
              columns={columns.map(column => ({
                key: column.id ?? 'none',
                name: column.name,
                tasks: idsOf(laneKey(column)).flatMap(id => {
                  const task = byId.get(id)
                  return task ? [task] : []
                }),
                footer: addTask(column),
                dropId: laneKey(column)
              }))}
              row={task => listRow(task, true)}
            />
          )}
        </BoardDrag>
      )}
      {board.layout === 'calendar' && (
        <CalendarLayout
          tasks={topLevel}
          item={task => <CalendarTask key={task.id} task={task} />}
          onAdd={
            editable
              ? dueDate => {
                  openNewTask(dueDate ?? undefined)
                }
              : undefined
          }
        />
      )}
      <LinkedTask board={board} editable={editable} settled={settled} />
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

function ArchivedBanner({ board }: { board: Board }): ReactElement {
  const { t } = useI18n()
  const unarchive = useSetBoardArchived()
  return (
    <Alert
      severity={unarchive.isError ? 'error' : 'info'}
      className="u-mb-1"
      action={
        board.role === 'admin' && (
          <Button
            variant="text"
            size="small"
            disabled={unarchive.isPending}
            onClick={() => {
              unarchive.mutate({ boardId: board.id, archived: false })
            }}
          >
            {t('archive.unarchive')}
          </Button>
        )
      }
    >
      {t(unarchive.isError ? 'archive.failed' : 'archive.boardArchived')}
    </Alert>
  )
}

function BoardTitle({
  board,
  renaming,
  onRename,
  bare = false
}: {
  board: Board
  renaming: boolean
  onRename: (renaming: boolean) => void
  /** Without its heading, for a breadcrumb that is one. */
  bare?: boolean
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
  const name = renamable ? (
    <CutTooltip title={t('board.rename')}>
      <TitleButton
        focusOnMount={returned}
        onClick={() => {
          setReturned(false)
          onRename(true)
        }}
      >
        {board.name}
      </TitleButton>
    </CutTooltip>
  ) : (
    board.name
  )
  return bare ? (
    <>{name}</>
  ) : (
    <PageTitle variant="h3" component="h1" noWrap>
      {name}
    </PageTitle>
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
