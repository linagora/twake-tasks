import type { ReactElement } from 'react'

import type { AgendaTask } from '@/application/boards'
import {
  useBoard,
  useBoards,
  useCachedBoard,
  useRefreshLists
} from '@/ui/boards/queries'
import { TaskPanel } from '@/ui/boards/TaskPanel'
import { useTaskPanel, type TaskPanelState } from '@/ui/boards/useTaskPanel'

/**
 * The panel of a task of a list: the board its panel loads keeps it open
 * under a sub-task, and the list refreshes once it closes, since a change
 * can take the task off the list.
 */
export function useAgendaTaskPanel(
  task: Pick<AgendaTask, 'key' | 'boardId'>
): TaskPanelState {
  const panel = useTaskPanel(task.key, useCachedBoard(task.boardId)?.tasks)
  const refresh = useRefreshLists()
  return {
    ...panel,
    close: () => {
      panel.close()
      refresh()
    }
  }
}

/**
 * A task opened from Today, My tasks, a search…: it opens over that page,
 * whose breadcrumb it keeps, with its board's latest version of it.
 */
export function AgendaTaskPanel({
  task,
  onClose
}: {
  task: AgendaTask
  onClose: () => void
}): ReactElement {
  const board = useBoard(task.boardId).data
  const summary = useBoards().data?.find(each => each.id === task.boardId)
  const fresh = board?.tasks.find(each => each.id === task.id) ?? task
  const editable =
    summary !== undefined && summary.role !== 'viewer' && !summary.archived
  return (
    <TaskPanel
      task={fresh}
      boardId={task.boardId}
      editable={editable}
      depth={1}
      onClose={onClose}
    />
  )
}
