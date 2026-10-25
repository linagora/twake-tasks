import { useContext, type ReactElement } from 'react'
import { useLocation } from 'react-router'

import { useInPeek } from '@/ds/SidePanel'
import type { Board, Task } from '@/domain/board'
import {
  BoardStepsContext,
  Crumbs,
  OriginContext,
  useBoardsOrigin
} from '@/ui/boards/Crumbs'
import { useI18n } from '@/ui/i18n/useI18n'

/**
 * Where a task was opened from: the page (Today, My tasks, Boards…), its
 * board (and shelf) and the tasks it is a sub-task of when opened in its
 * board, then its key.
 */
export function TaskBreadcrumb({
  task,
  board
}: {
  task: Task
  board: Board | undefined
}): ReactElement {
  const { t } = useI18n()
  const { search } = useLocation()
  const inPeek = useInPeek()
  const boards = useBoardsOrigin()
  const origin = useContext(OriginContext) ?? boards
  const boardSteps = useContext(BoardStepsContext)
  const ancestors: Task[] = []
  if (boardSteps) {
    for (
      let parent = board?.tasks.find(each => each.id === task.parentId);
      parent;
      parent = board?.tasks.find(each => each.id === parent.parentId)
    ) {
      ancestors.unshift(parent)
    }
  }

  // Parents open on the board: a shelf lists none of a hidden task's parents.
  const boardPath = boardSteps?.[0]?.to ?? '.'
  const parents = ancestors.map(parent => {
    const params = new URLSearchParams(search)
    params.set('task', parent.key)
    return {
      to: `${boardPath}?${params.toString()}`,
      label: parent.key,
      relative: true
    }
  })

  // A peek sits beside the page and its board: the task's own path is enough.
  return (
    <Crumbs
      label={t('task.breadcrumb')}
      origin={inPeek ? undefined : origin}
      steps={inPeek || !boardSteps ? parents : [...boardSteps, ...parents]}
      current={task.key}
    />
  )
}
