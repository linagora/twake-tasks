import { Home, Icon } from '@linagora/twake-icons'
import { Breadcrumbs, Link, Typography } from '@linagora/twake-mui'
import type { ReactElement } from 'react'
import { Link as RouterLink, useLocation } from 'react-router'

import type { Board, Task } from '@/domain/board'
import { useI18n } from '@/ui/i18n/useI18n'

/**
 * Where an open task sits: the boards, its board, the tasks it is a sub-task
 * of, then its key. The links stay in the page's own tree, also in an embed.
 */
export function TaskBreadcrumb({
  task,
  boardId,
  board
}: {
  task: Task
  boardId: string
  board: Board | undefined
}): ReactElement {
  const { t } = useI18n()
  const { pathname } = useLocation()
  const at = pathname.indexOf('/boards/')
  const home = at < 0 ? pathname : pathname.slice(0, at) || '/'
  const boardPath =
    at < 0 ? pathname : `${pathname.slice(0, at)}/boards/${boardId}`
  const ancestors: Task[] = []
  for (
    let parent = board?.tasks.find(each => each.id === task.parentId);
    parent;
    parent = board?.tasks.find(each => each.id === parent.parentId)
  ) {
    ancestors.unshift(parent)
  }

  return (
    <Breadcrumbs aria-label={t('task.breadcrumb')} className="u-miw-0">
      <Link
        component={RouterLink}
        to={home}
        color="inherit"
        aria-label={t('boards.title')}
        className="u-flex"
      >
        <Icon icon={Home} size={16} />
      </Link>
      <Link
        component={RouterLink}
        to={boardPath}
        color="inherit"
        underline="hover"
        variant="body2"
      >
        {board?.name ?? '…'}
      </Link>
      {ancestors.map(parent => (
        <Link
          key={parent.id}
          component={RouterLink}
          to={`${boardPath}?task=${encodeURIComponent(parent.key)}`}
          color="inherit"
          underline="hover"
          variant="body2"
        >
          {parent.key}
        </Link>
      ))}
      <Typography variant="body2" color="textPrimary" aria-current="page">
        {task.key}
      </Typography>
    </Breadcrumbs>
  )
}
