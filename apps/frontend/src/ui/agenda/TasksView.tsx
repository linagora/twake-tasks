import { CheckCircle, Icon, Plus } from '@linagora/twake-icons'
import { Button, Typography } from '@linagora/twake-mui'
import { useQueryClient } from '@tanstack/react-query'
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import { useSearchParams } from 'react-router'

import type { AgendaTask, FilterCriteria, TaskMove } from '@/application/boards'
import { hiddenFactsOf } from '@/application/hiddenFacts'
import {
  placeInColumn,
  viewMove,
  viewTaskDefaults
} from '@/application/viewTask'
import {
  Card,
  CardTitle,
  Column,
  Columns,
  ColumnsSkeleton,
  EmptyColumn
} from '@/ds/Columns'
import { EmptyState } from '@/ds/EmptyState'
import { PageHeader } from '@/ds/PageHeader'
import type { IconComponent } from '@/ds/viewIcons'
import { DropColumn, SortableList } from '@/ds/Sortable'
import type { Board, Grouping, Layout, Section } from '@/domain/board'
import { displayName } from '@/domain/person'
import { viewColumns } from '@/domain/viewColumns'
import { viewGroups, type Group } from '@/domain/viewGroups'
import { MissingStatusDialog } from '@/ui/agenda/MissingStatusDialog'
import { NewViewTask } from '@/ui/agenda/NewViewTask'
import { ViewAddTask } from '@/ui/agenda/ViewAddTask'
import { ViewTaskPanel } from '@/ui/agenda/ViewTaskPanel'
import { BoardDrag } from '@/ui/boards/BoardDrag'
import { CalendarTask } from '@/ui/boards/CalendarTask'
import { localToday } from '@/ui/boards/dueLabel'
import { HiddenFactsContext } from '@/ui/boards/HiddenFacts'
import { CalendarLayout, ListLayout } from '@/ui/boards/Layouts'
import {
  useAddStatusAndMove,
  useAgenda,
  useBoard,
  useBoards,
  useBoardsOf,
  useMoveTask,
  useMoveViewTask,
  useRefreshLists,
  type AgendaView
} from '@/ui/boards/queries'
import { TaskCard } from '@/ui/boards/TaskCard'
import { TaskListRow } from '@/ui/boards/TaskListRow'
import { useI18n } from '@/ui/i18n/useI18n'

/**
 * The view spans many boards, while a change only refreshes its own board: a
 * change made from the view refreshes it, one made in a task's panel once the
 * panel closes, as the other lists do, so the task stays while it is open.
 */
function useRefreshView(): void {
  const queryClient = useQueryClient()
  const refresh = useRefreshLists()
  const [params] = useSearchParams()
  const open = params.get('task') !== null
  const latest = useRef({ open, refresh })
  useEffect(() => {
    const was = latest.current.open
    latest.current = { open, refresh }
    if (was && !open) refresh()
  })
  useEffect(
    () =>
      queryClient.getMutationCache().subscribe(event => {
        if (
          event.type === 'updated' &&
          event.action.type === 'success' &&
          !latest.current.open
        ) {
          latest.current.refresh()
        }
      }),
    [queryClient]
  )
}

/**
 * Tasks of many boards picked by criteria, in the layouts of a board: a
 * custom view, or My tasks. The columns are the boards' sections, merged by
 * name; tasks are added and dragged as on a board, with what the criteria
 * ask of them. Grouped by something else, the columns are its values, and
 * tasks are added from the header only. Tasks show all their fields but the
 * one they are grouped by.
 */
export function TasksView({
  source,
  criteria,
  layout,
  groupBy = 'status',
  allColumns = false,
  title,
  back,
  actions,
  empty
}: {
  source: AgendaView
  criteria: FilterCriteria
  layout: Layout
  groupBy?: Grouping
  /** Columns of statuses no task is in show too. */
  allColumns?: boolean
  title: ReactNode
  back?: ReactNode
  actions?: ReactNode
  /** What to say when no task matches, if not that there is nothing to do. */
  empty?: { icon: IconComponent; title: string; text: string }
}): ReactElement {
  const { t } = useI18n()
  const agenda = useAgenda(source)
  const boards = useBoards()
  const moveTask = useMoveViewTask()
  const [adding, setAdding] = useState(false)
  const [addingOn, setAddingOn] = useState<string | null>(null)
  const [addingIn, setAddingIn] = useState<string | null>(null)
  const addStatus = useAddStatusAndMove()
  // A task dropped in a column its board has not, which a dialog asks about.
  const [missing, setMissing] = useState<{
    task: AgendaTask
    board: Board
    status: Omit<Section, 'id'>
    neighbours: Omit<TaskMove, 'sectionId'>
  } | null>(null)
  const groupName = useGroupName()
  const tasks = agenda.data?.tasks ?? []
  const boardIds = [...new Set(tasks.map(task => task.boardId))]
  const sources = useBoardsOf(boardIds)
  const defaults = viewTaskDefaults(criteria, boards.data ?? [], localToday())
  const homes = useBoardsOf(defaults.boardId ? [defaults.boardId] : [])
  useRefreshView()

  const writable = new Set(
    (boards.data ?? [])
      .filter(board => board.role !== 'viewer' && !board.archived)
      .map(board => board.id)
  )
  const editable = (task: AgendaTask) => writable.has(task.boardId)
  const candidates = [
    ...homes,
    ...sources.filter(board => board.id !== defaults.boardId)
  ].filter(board => writable.has(board.id))
  const columns = viewColumns(tasks, sources, allColumns).map(column => ({
    ...column,
    section: column.name,
    name: column.name ?? t('board.noSection')
  }))
  const groups =
    groupBy === 'status'
      ? []
      : viewGroups(tasks, groupBy, localToday()).map(each => ({
          key: each.key,
          name: groupName(each.group),
          tasks: each.tasks,
          footer: null
        }))
  const byId = new Map(tasks.map(task => [task.id, task]))
  const canAdd = boards.data !== undefined && defaults.boardId !== ''
  const addTask = (column: (typeof columns)[number]) =>
    canAdd && (
      <ViewAddTask
        task={{
          ...defaults,
          ...placeInColumn(defaults.boardId, candidates, column.section)
        }}
        sectionName={column.name}
        open={addingIn === column.key}
        onOpen={() => {
          setAddingIn(column.key)
        }}
        onClose={() => {
          setAddingIn(current => (current === column.key ? null : current))
        }}
      />
    )
  // Columns wait for the boards, which hold the sections.
  const ready = groupBy !== 'status' || sources.length === boardIds.length

  return (
    <HiddenFactsContext value={hiddenFactsOf(groupBy)}>
      <main className="u-p-2">
        <PageHeader
          back={back}
          title={title}
          actions={
            <>
              {actions}
              <Button
                startIcon={<Icon icon={Plus} />}
                disabled={!canAdd}
                onClick={() => {
                  setAdding(true)
                }}
              >
                {t('board.newTask')}
              </Button>
            </>
          }
        />
        {adding && canAdd && (
          <NewViewTask
            criteria={criteria}
            dueOn={addingOn ?? undefined}
            onClose={() => {
              setAdding(false)
              setAddingOn(null)
            }}
          />
        )}
        <ViewTaskPanel
          tasks={tasks}
          editable={boardId => writable.has(boardId)}
        />
        {missing && (
          <MissingStatusDialog
            board={missing.board.name}
            status={missing.status.name}
            busy={addStatus.isPending}
            failed={addStatus.isError}
            onCancel={() => {
              setMissing(null)
            }}
            onAdd={() => {
              addStatus.mutate(
                {
                  boardId: missing.board.id,
                  taskId: missing.task.id,
                  status: missing.status,
                  neighbours: missing.neighbours
                },
                {
                  onSuccess: () => {
                    setMissing(null)
                  }
                }
              )
            }}
          />
        )}
        {(agenda.isError || moveTask.isError) && (
          <Typography role="alert">{t('agenda.loadFailed')}</Typography>
        )}
        {agenda.isPending && <ColumnsSkeleton label={t('app.loading')} />}
        {agenda.isSuccess && tasks.length === 0 && layout !== 'calendar' && (
          <EmptyState
            icon={empty?.icon ?? CheckCircle}
            title={empty?.title ?? t('agenda.empty')}
            text={empty?.text ?? t('agenda.emptyHint')}
            action={
              canAdd && (
                <Button
                  startIcon={<Icon icon={Plus} />}
                  onClick={() => {
                    setAdding(true)
                  }}
                >
                  {t('board.newTask')}
                </Button>
              )
            }
          />
        )}
        {tasks.length > 0 && layout !== 'calendar' && !ready && (
          <ColumnsSkeleton label={t('app.loading')} />
        )}
        {tasks.length > 0 && layout === 'board' && groupBy !== 'status' && (
          <Columns>
            {groups.map(group => (
              <HiddenFactsContext
                key={group.key}
                value={hiddenFactsOf(
                  groupBy,
                  group.key === 'label:none' ? null : group.name
                )}
              >
                <Column title={group.name} count={group.tasks.length}>
                  {group.tasks.map(task => (
                    <ViewCard
                      key={task.id}
                      task={task}
                      tasks={tasks}
                      sortable={false}
                    />
                  ))}
                </Column>
              </HiddenFactsContext>
            ))}
          </Columns>
        )}
        {tasks.length > 0 &&
          layout === 'board' &&
          groupBy === 'status' &&
          ready && (
            <BoardDrag
              lanes={columns.map(column => ({
                key: column.key,
                sectionId: column.key,
                name: column.name,
                taskIds: column.tasks.map(task => task.id)
              }))}
              titleOf={id => {
                const task = byId.get(id)
                return task ? `${task.key} ${task.title}` : ''
              }}
              onMove={(taskId, to) => {
                const task = byId.get(taskId)
                const column = columns.find(each => each.key === to.sectionId)
                const board = sources.find(each => each.id === task?.boardId)
                if (!task || !column || !board || !editable(task)) return false
                const move = viewMove(
                  board,
                  column.section,
                  to,
                  id => byId.get(id)?.boardId === task.boardId
                )
                if (!move) {
                  // The column's status, as another board of the view has it.
                  const status = sources
                    .flatMap(each => each.sections)
                    .find(
                      each =>
                        each.name.trim().toLocaleLowerCase() ===
                        column.name.trim().toLocaleLowerCase()
                    )
                  const sameBoard = (id: string | undefined) =>
                    id !== undefined && byId.get(id)?.boardId === task.boardId
                  addStatus.reset()
                  setMissing({
                    task,
                    board,
                    status: {
                      name: status?.name ?? column.name,
                      category: status?.category ?? 'started'
                    },
                    neighbours: {
                      ...(sameBoard(to.afterId) && { afterId: to.afterId }),
                      ...(sameBoard(to.beforeId) && { beforeId: to.beforeId })
                    }
                  })
                  return false
                }
                moveTask.mutate({ boardId: task.boardId, taskId, move })
                return true
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
                    const ids = idsOf(column.key)
                    return (
                      <DropColumn
                        key={column.key}
                        id={column.key}
                        title={column.name}
                        count={ids.length}
                      >
                        <SortableList ids={ids}>
                          {ids.flatMap(id => {
                            const task = byId.get(id)
                            return task
                              ? [
                                  <ViewCard
                                    key={id}
                                    task={task}
                                    tasks={tasks}
                                  />
                                ]
                              : []
                          })}
                        </SortableList>
                        {ids.length === 0 && (
                          <EmptyColumn label={t('board.emptyColumn')} />
                        )}
                        {addTask(column)}
                      </DropColumn>
                    )
                  })}
                </Columns>
              )}
            </BoardDrag>
          )}
        {tasks.length > 0 && layout === 'list' && ready && (
          <ListLayout
            columns={
              groupBy === 'status'
                ? columns.map(column => ({
                    ...column,
                    footer: addTask(column)
                  }))
                : groups
            }
            row={task => (
              <ViewListRow
                key={task.id}
                task={task}
                editable={editable(task)}
              />
            )}
          />
        )}
        {agenda.isSuccess && layout === 'calendar' && (
          <CalendarLayout
            tasks={tasks}
            onAddOn={
              canAdd
                ? day => {
                    setAddingOn(day)
                    setAdding(true)
                  }
                : undefined
            }
            item={task => <CalendarTask key={task.id} task={task} />}
          />
        )}
      </main>
    </HiddenFactsContext>
  )
}

// A group named as the criterion's values are.
function useGroupName(): (group: Group) => string {
  const { t } = useI18n()
  return group => {
    switch (group.by) {
      case 'board':
        return group.name
      case 'assignee':
        return group.person
          ? displayName(group.person)
          : t('filters.assignees.unassigned')
      case 'priority':
        return group.level === null
          ? t('filters.noPriority')
          : t('board.priority', { level: group.level })
      case 'label':
        return group.name ?? t('filters.noLabel')
      case 'due':
        return group.when === 'later'
          ? t('filters.later')
          : t(`filters.dues.${group.when}`)
    }
  }
}

// A card of the board's own, with its people, labels and sections to move
// to once the board has loaded.
function ViewCard({
  task,
  tasks,
  sortable = true
}: {
  task: AgendaTask
  tasks: AgendaTask[]
  /** Dragged among the columns of statuses only. */
  sortable?: boolean
}): ReactElement {
  const board = useBoard(task.boardId).data
  const move = useMoveTask(task.boardId)
  const editable =
    board !== undefined && board.role !== 'viewer' && !board.archived
  return (
    <TaskCard
      sortable={sortable}
      task={task}
      boardName={task.boardName}
      parentTitle={task.parentTitle}
      tasks={board?.tasks ?? tasks}
      boardId={task.boardId}
      members={board?.members ?? []}
      labels={board?.labels ?? []}
      destinations={(board?.sections ?? []).filter(
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
}

// Done is a section of the board for tasks in sections, so the row waits for
// the board before it can be checked.
function ViewListRow({
  task,
  editable
}: {
  task: AgendaTask
  editable: boolean
}): ReactElement {
  const board = useBoard(task.boardId).data
  return (
    <TaskListRow
      task={task}
      boardName={task.boardName}
      parentTitle={task.parentTitle}
      boardId={task.boardId}
      sections={board?.sections ?? []}
      editable={editable && board !== undefined}
    />
  )
}
