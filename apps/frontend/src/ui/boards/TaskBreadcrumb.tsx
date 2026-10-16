import type { ReactElement } from 'react'
import { useLocation } from 'react-router'

import type { Board, Task } from '@/domain/board'
import { Crumbs } from '@/ui/boards/Crumbs'
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
    <Crumbs
      label={t('task.breadcrumb')}
      home={{ to: home, label: t('board.back') }}
      steps={[
        { to: boardPath, label: board?.name ?? '…' },
        ...ancestors.map(parent => ({
          to: `${boardPath}?task=${encodeURIComponent(parent.key)}`,
          label: parent.key
        }))
      ]}
      current={task.key}
    />
  )
}
