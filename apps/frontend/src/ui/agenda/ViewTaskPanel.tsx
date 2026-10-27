import { useState, type ReactElement } from 'react'
import { useSearchParams } from 'react-router'

import type { AgendaTask } from '@/application/boards'
import { useBoard } from '@/ui/boards/queries'
import { LinkedTaskPanel } from '@/ui/boards/TaskPanel'
import { lineage } from '@/ui/boards/useTaskPanel'

/**
 * The panel of the task in `?task=`, as a board shows it, over a view of the
 * tasks of many boards: the task's own board holds its sub-tasks, whose
 * panels open from it while the view does not list them.
 */
export function ViewTaskPanel({
  tasks,
  editable
}: {
  tasks: readonly AgendaTask[]
  editable: (boardId: string) => boolean
}): ReactElement | null {
  const [params] = useSearchParams()
  const shown = params.get('task')
  const listed = tasks.find(task => task.key === shown)
  // A sub-task opened from its parent's panel stays on the parent's board.
  const [boardId, setBoardId] = useState<string | null>(null)
  if (listed && listed.boardId !== boardId) setBoardId(listed.boardId)
  const home = listed?.boardId ?? boardId
  if (shown === null || home === null) return null
  return <BoardTaskPanel shown={shown} boardId={home} editable={editable} />
}

function BoardTaskPanel({
  shown,
  boardId,
  editable
}: {
  shown: string
  boardId: string
  editable: (boardId: string) => boolean
}): ReactElement | null {
  const board = useBoard(boardId).data
  if (!board) return null
  const rootKey = lineage(shown, board.tasks).at(-1)
  const root = board.tasks.find(task => task.key === rootKey)
  return root ? (
    <LinkedTaskPanel
      key={root.id}
      task={root}
      tasks={board.tasks}
      boardId={board.id}
      editable={editable(board.id)}
      depth={1}
    />
  ) : null
}
