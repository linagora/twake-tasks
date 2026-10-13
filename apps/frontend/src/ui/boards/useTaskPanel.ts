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

  const own = tasks.find(task => task.key === key)
  const parentKey = tasks.find(task => task.id === own?.parentId)?.key
  const close = useCallback(() => {
    setParams(
      current => {
        const next = new URLSearchParams(current)
        if (parentKey) next.set('task', parentKey)
        else next.delete('task')
        return next
      },
      { replace: true }
    )
  }, [parentKey, setParams])

  return { open, show, close }
}

function lineage(key: string, tasks: Task[]): string[] {
  const keys = [key]
  let task = tasks.find(each => each.key === key)
  while (task?.parentId) {
    const parentId = task.parentId
    task = tasks.find(each => each.id === parentId)
    if (task) keys.push(task.key)
  }
  return keys
}
