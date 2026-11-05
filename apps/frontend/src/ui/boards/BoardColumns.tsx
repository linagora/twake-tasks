import { Typography } from '@linagora/twake-mui'
import { Fragment, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'

import type { SectionMove, Shelf, TaskMove } from '@/application/boards'
import { CardDragPreview, Column, Columns, EmptyColumn } from '@/ds/Columns'
import { CompletedFold } from '@/ds/CompletedFold'
import { ListDragPreview } from '@/ds/ListView'
import {
  DropColumn,
  SortableColumn,
  SortableColumns,
  SortableList
} from '@/ds/Sortable'
import {
  isEditable,
  isFolded,
  isManageable,
  isShareable,
  type Board,
  type Section,
  type Task
} from '@/domain/board'
import { AddTask } from '@/ui/boards/AddTask'
import {
  RemovalNotice,
  RemovalNotices,
  type Removal
} from '@/ui/boards/Archive'
import { BoardCalendar } from '@/ui/boards/BoardCalendar'
import { BoardDrag, columnSortId } from '@/ui/boards/BoardDrag'
import { NoMatch, useShownTasks } from '@/ui/boards/BoardFilter'
import { ListLayout } from '@/ui/boards/Layouts'
import { LinkedTask } from '@/ui/boards/LinkedTask'
import { sortTasks, useListSort } from '@/ui/boards/listSort'
import { ProgressLayout } from '@/ui/boards/ProgressLayout'
import { useBoardChange } from '@/ui/queries/boards'
import { useMoveTask } from '@/ui/queries/tasks'
import { NewSectionButton, SectionMenu } from '@/ui/boards/SectionControls'
import { TaskCard } from '@/ui/boards/TaskCard'
import { TaskListRow } from '@/ui/boards/TaskListRow'
import { useCompletedFold } from '@/ui/boards/useCompletedFold'
import { useI18n } from '@/ui/i18n/useI18n'

export function BoardColumns({
  board,
  settled
}: {
  board: Board
  settled: boolean
}): ReactElement {
  const { t, lang } = useI18n()
  const move = useMoveTask(board.id)
  const moveSection = useBoardChange(
    board.id,
    (api, { sectionId, to }: { sectionId: string; to: SectionMove }) =>
      api.moveSection(board.id, sectionId, to)
  )
  // Only the column is lifted when it carries its cards along.
  const taskPreview = (task: Task, drag: 'lifted' | 'none' = 'lifted') => (
    <CardDragPreview taskKey={task.key} title={task.title} drag={drag} />
  )
  const editable = isEditable(board)
  const manageable = isManageable(board)
  const shareable = isShareable(board)
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
  const shown = useShownTasks(board, topLevel)
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
        onCreated={shown.keep}
      />
    )
  const tasksIn = (column: (typeof columns)[number], folded = false) =>
    shown.tasks.filter(
      task =>
        task.sectionId === column.id &&
        isFolded(task, board.sections) === folded
    )
  const listRow = (task: Task, sortable = false) => (
    <TaskListRow
      key={task.id}
      sortable={sortable}
      task={task}
      sections={board.sections}
    />
  )
  const listSort = useListSort(board.id)
  const sorted = (tasks: Task[]) => sortTasks(tasks, listSort.sort, lang)
  const completedFold = useCompletedFold(board.id)
  const fold = (column: (typeof columns)[number], list = false) => {
    const tasks = tasksIn(column, true)
    return (
      tasks.length > 0 && (
        <CompletedFold
          label={t('board.completedFold', { smart_count: tasks.length })}
          expanded={completedFold.expanded}
          onToggle={completedFold.toggle}
          list={list}
        >
          {list
            ? sorted(tasks).map(task => listRow(task))
            : tasks.map(task => card(task))}
        </CompletedFold>
      )
    )
  }
  const listFooter = (column: (typeof columns)[number]) => (
    <>
      {addTask(column)}
      {fold(column, true)}
    </>
  )
  const empty = (column: (typeof columns)[number], open: number) =>
    open === 0 &&
    tasksIn(column, true).length === 0 && (
      <EmptyColumn label={t('board.emptyColumn')} />
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

  return (
    <RemovalNotices.Provider value={setRemoval}>
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
      {shown.filtered && shown.tasks.length === 0 && <NoMatch />}
      {board.layout === 'progress' && <ProgressLayout board={board} />}
      {board.layout === 'board' && !editable && (
        <Columns>
          {columns.map(column => (
            <Column
              key={columnKey(column)}
              title={column.name}
              count={shown.count(tasksIn(column).length, column.id)}
            >
              {tasksIn(column).map(task => card(task))}
              {empty(column, tasksIn(column).length)}
              {fold(column)}
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
                        count={shown.count(tasks.length, column.id)}
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
                count: shown.count(ids.length, column.id),
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
                    {empty(column, ids.length)}
                    {addTask(column)}
                    {fold(column)}
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
              <Columns>
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
                  {sections.map(column => {
                    const props = content(column)
                    return manageable ? (
                      <SortableColumn
                        key={columnKey(column)}
                        id={laneKey(column)}
                        sortId={columnSortId(columnKey(column))}
                        description={t('drag.column')}
                        instructions={t('drag.columnInstructions')}
                        label={t('board.sectionCount', {
                          section: column.name,
                          smart_count: idsOf(laneKey(column)).length
                        })}
                        title={column.name}
                        {...props}
                      />
                    ) : (
                      <DropColumn
                        key={columnKey(column)}
                        id={laneKey(column)}
                        title={column.name}
                        {...props}
                      />
                    )
                  })}
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
            key: columnKey(column),
            name: column.name,
            tasks: sorted(tasksIn(column)),
            count: shown.count(tasksIn(column).length, column.id),
            footer: listFooter(column)
          }))}
          row={listRow}
          sort={listSort.sort}
          onSort={listSort.sortBy}
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
                key: columnKey(column),
                name: column.name,
                tasks: sorted(
                  idsOf(laneKey(column)).flatMap(id => {
                    const task = byId.get(id)
                    return task ? [task] : []
                  })
                ),
                count: shown.count(idsOf(laneKey(column)).length, column.id),
                footer: listFooter(column),
                // A sorted list shows no board order to drag tasks within.
                dropId: listSort.sort ? undefined : laneKey(column)
              }))}
              row={task => listRow(task, !listSort.sort)}
              sort={listSort.sort}
              onSort={listSort.sortBy}
            />
          )}
        </BoardDrag>
      )}
      {board.layout === 'calendar' && (
        <BoardCalendar board={board} tasks={shown.tasks} />
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
