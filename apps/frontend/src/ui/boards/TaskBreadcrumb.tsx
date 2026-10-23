import { useContext, type ReactElement } from 'react'
import { useLocation } from 'react-router'

import { useInPeek } from '@/ds/SidePanel'
import type { Board, Task } from '@/domain/board'
import {
  BoardStepContext,
  Crumbs,
  OriginContext,
  useBoardsOrigin
} from '@/ui/boards/Crumbs'
import { useI18n } from '@/ui/i18n/useI18n'

/**
 * Where a task was opened from: the page (Today, My tasks, Boards…), its
 * board and the tasks it is a sub-task of when opened in its board, then its
 * key.
 */
export function TaskBreadcrumb({
  task,
  board
}: {
  task: Task
  board: Board | undefined
}): ReactElement {
  const { t } = useI18n()
  const { pathname, search } = useLocation()
  const inPeek = useInPeek()
  const boards = useBoardsOrigin()
  const origin = useContext(OriginContext) ?? boards
  const boardStep = useContext(BoardStepContext)
  const ancestors: Task[] = []
  if (boardStep) {
    for (
      let parent = board?.tasks.find(each => each.id === task.parentId);
      parent;
      parent = board?.tasks.find(each => each.id === parent.parentId)
    ) {
      ancestors.unshift(parent)
    }
  }

  const parents = ancestors.map(parent => {
    const params = new URLSearchParams(search)
    params.set('task', parent.key)
    return { to: `${pathname}?${params.toString()}`, label: parent.key }
  })

  // A peek sits beside the page and its board: the task's own path is enough.
  return (
    <Crumbs
      label={t('task.breadcrumb')}
      origin={inPeek ? undefined : origin}
      steps={inPeek || !boardStep ? parents : [boardStep, ...parents]}
      current={task.key}
    />
  )
}
