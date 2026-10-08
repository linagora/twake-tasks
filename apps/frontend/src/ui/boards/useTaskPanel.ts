import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

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
 */
export function useTaskPanel(key: string): TaskPanelState {
  const [params, setParams] = useSearchParams()
  const open = params.get('task') === key

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
    setParams(
      current => {
        const next = new URLSearchParams(current)
        next.delete('task')
        return next
      },
      { replace: true }
    )
  }, [setParams])

  return { open, show, close }
}
