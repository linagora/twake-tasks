import { useSearchParams } from 'react-router'

const DAY = /^\d{4}-\d{2}-\d{2}$/

// The shape alone lets impossible days through, as 2026-02-31.
const isDay = (text: string): boolean =>
  DAY.test(text) && new Date(`${text}T00:00:00Z`).toISOString().startsWith(text)

/**
 * The new task dialog is open while the URL holds `?new=task`, so a link opens
 * it; `&due=` fills in its due date. Like a task's panel, it is not a page to
 * go back to: it replaces the entry of the history.
 */
export function useNewTaskParam(): {
  creating: boolean
  dueDate: string | undefined
  openNewTask: (dueDate?: string) => void
  closeNewTask: () => void
} {
  const [params, setParams] = useSearchParams()
  const due = params.get('due')
  const set = (open: boolean, dueDate?: string) => {
    setParams(
      current => {
        const next = new URLSearchParams(current)
        next.delete('due')
        if (open) next.set('new', 'task')
        else next.delete('new')
        if (open && dueDate) next.set('due', dueDate)
        return next
      },
      { replace: true }
    )
  }
  return {
    creating: params.get('new') === 'task',
    dueDate: due !== null && isDay(due) ? due : undefined,
    openNewTask: dueDate => {
      set(true, dueDate)
    },
    closeNewTask: () => {
      set(false)
    }
  }
}
