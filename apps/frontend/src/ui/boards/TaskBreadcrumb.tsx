import { Breadcrumbs, Link, Typography } from '@linagora/twake-mui'
import { useContext, type ReactElement } from 'react'
import { Link as RouterLink, useLocation } from 'react-router'

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
  if (inPeek) {
    return (
      <Breadcrumbs aria-label={t('task.breadcrumb')} className="u-miw-0">
        {parents.map(parent => (
          <Link
            key={parent.to}
            component={RouterLink}
            to={parent.to}
            color="inherit"
            underline="hover"
            variant="body2"
          >
            {parent.label}
          </Link>
        ))}
        <Typography variant="body2" color="textPrimary" aria-current="page">
          {task.key}
        </Typography>
      </Breadcrumbs>
    )
  }
  return (
    <Crumbs
      label={t('task.breadcrumb')}
      origin={origin}
      steps={[...(boardStep ? [boardStep] : []), ...parents]}
      current={task.key}
    />
  )
}
