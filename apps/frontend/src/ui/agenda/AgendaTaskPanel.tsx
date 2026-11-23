import { useCallback, useLayoutEffect, useRef, type ReactElement } from 'react'
import { useSearchParams } from 'react-router'

import type { AgendaTask } from '@/application/boards'
import { isEditable } from '@/domain/board'
import { useRefreshLists } from '@/ui/queries/agenda'
import { useBoard, useBoards, useCachedTasks } from '@/ui/queries/boards'
import { TaskPanel } from '@/ui/boards/TaskPanel'
import { lineage, useOpenTask, useTaskPanel } from '@/ui/boards/useTaskPanel'

export interface AgendaPanels {
  /** Its panel is open, or the panel of one of its sub-tasks. */
  isOpen: (key: string) => boolean
  /** Keeps its identity, so the rows of the list do not render again. */
  show: (key: string, commentId?: string) => void
}

/**
 * The panels of a list's tasks, read once for the whole list so that a task
 * opening or closing does not render every row again. The boards the panels
 * load keep a task open under its sub-task.
 */
export function useAgendaPanels(
  tasks: Pick<AgendaTask, 'boardId'>[]
): AgendaPanels {
  const [params] = useSearchParams()
  const shown = params.get('task')
  const boardTasks = useCachedTasks(
    shown === null ? [] : [...new Set(tasks.map(task => task.boardId))]
  )
  const open = shown === null ? [] : lineage(shown, boardTasks)
  const openTask = useOpenTask()
  const refresh = useRefreshLists()
  const latest = useRef(shown)
  useLayoutEffect(() => {
    latest.current = shown
  })
  const show = useCallback(
    (key: string, commentId?: string) => {
      // A task opened beside a peek closes the one in it.
      if (latest.current !== null && latest.current !== key) refresh()
      openTask(key, commentId)
    },
    [openTask, refresh]
  )
  return { isOpen: key => open.includes(key), show }
}

/**
 * A task opened from Today, My tasks, a search…: it opens over that page,
 * whose breadcrumb it keeps, with its board's latest version of it. The list
 * refreshes once it closes, since a change can take the task off the list.
 */
export function AgendaTaskPanel({ task }: { task: AgendaTask }): ReactElement {
  const board = useBoard(task.boardId).data
  const summary = useBoards().data?.find(each => each.id === task.boardId)
  const panel = useTaskPanel(task.key, board?.tasks)
  const refresh = useRefreshLists()
  const fresh = board?.tasks.find(each => each.id === task.id) ?? task
  const editable = summary !== undefined && isEditable(summary)
  return (
    <TaskPanel
      task={fresh}
      boardId={task.boardId}
      editable={editable}
      depth={1}
      onClose={() => {
        panel.close()
        refresh()
      }}
    />
  )
}
