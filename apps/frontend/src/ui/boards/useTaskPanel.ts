import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

import type { Task } from '@/domain/board'

export interface TaskPanelState {
  open: boolean
  show: () => void
  close: () => void
}

/**
 * The panel of a task is open while `?task=` holds its key, so the URL, not
 * the item showing the task, is the state: the items of a view come and go
 * when the view changes, and a deep link opens the task. The panel is not a
 * page to go back to, so it replaces the entry of the history, as TwakeSpace
 * does with a push in the frame.
 *
 * On a board, the board shows the panel, not the item: a view does not render
 * every task (another month of the calendar, a collapsed section, a sub-task).
 * A sub-task's panel opens over the ones of its parents, so `?task=` holding
 * a sub-task also opens its ancestors among `tasks`, and closing it goes back
 * to its parent.
 */
export function useTaskPanel(key: string, tasks: Task[] = []): TaskPanelState {
  const [params, setParams] = useSearchParams()
  const shown = params.get('task')
  const open = shown !== null && lineage(shown, tasks).includes(key)

  const show = useCallback(() => {
    setParams(
      current => {
        const next = new URLSearchParams(current)
        next.set('task', key)
        return next
      },
      { replace: true }
    )
  }, [key, setParams])

  const close = useCallback(() => {
    const parentKey = lineage(key, tasks)[1]
    setParams(
      current => {
        const next = new URLSearchParams(current)
        if (parentKey) next.set('task', parentKey)
        else {
          next.delete('task')
          next.delete('panel')
        }
        return next
      },
      { replace: true }
    )
  }, [key, tasks, setParams])

  return { open, show, close }
}

/**
 * `?panel=full` opens the task over the whole content, so a copied link opens
 * it the same way; without it, the task opens in a peek beside the page.
 */
export function useExpandedPanel(): [boolean, (expanded: boolean) => void] {
  const [params, setParams] = useSearchParams()
  const expand = (expanded: boolean) => {
    setParams(
      current => {
        const next = new URLSearchParams(current)
        if (expanded) next.set('panel', 'full')
        else next.delete('panel')
        return next
      },
      { replace: true }
    )
  }
  return [params.get('panel') === 'full', expand]
}

/** The key, then the keys of its parents up to its top-level task */
export function lineage(key: string, tasks: Task[]): string[] {
  const keys = [key]
  let task = tasks.find(each => each.key === key)
  while (task?.parentId) {
    const parentId = task.parentId
    task = tasks.find(each => each.id === parentId)
    if (!task || keys.includes(task.key)) break
    keys.push(task.key)
  }
  return keys
}
