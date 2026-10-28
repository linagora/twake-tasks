import { useSearchParams } from 'react-router'

import { inDays } from '@/ui/boards/dueLabel'

const DAY = /^\d{4}-\d{2}-\d{2}$/

// The shape alone lets impossible days through, as 2026-02-31. Date.UTC rolls
// them over in every engine; parsing the text instead gives an Invalid Date
// (in Safari, or for a month above 12), whose toISOString throws.
const isDay = (text: string): boolean => {
  if (!DAY.test(text)) return false
  const date = Date.UTC(
    Number(text.slice(0, 4)),
    Number(text.slice(5, 7)) - 1,
    Number(text.slice(8))
  )
  return new Date(date).toISOString().startsWith(text)
}

export interface NewTaskPreset {
  dueDate?: string | undefined
  assignToMe?: boolean
}

/** So that a task created from an agenda shows in it. */
export const agendaPreset = (
  view: 'today' | 'upcoming' | 'mine'
): NewTaskPreset =>
  view === 'mine'
    ? { assignToMe: true }
    : { dueDate: inDays(view === 'today' ? 0 : 1) }

/**
 * The new task dialog is open while the URL holds `?new=task`, so a link opens
 * it; `&due=` fills in its due date, `&assign=me` its assignee. Like a task's
 * panel, it is not a page to go back to: it replaces the entry of the history.
 */
export function useNewTaskParam(): {
  creating: boolean
  preset: NewTaskPreset
  openNewTask: (preset?: NewTaskPreset) => void
  closeNewTask: () => void
} {
  const [params, setParams] = useSearchParams()
  const due = params.get('due')
  const set = (open: boolean, preset: NewTaskPreset = {}) => {
    setParams(
      current => {
        const next = new URLSearchParams(current)
        next.delete('due')
        next.delete('assign')
        if (open) next.set('new', 'task')
        else next.delete('new')
        if (open && preset.dueDate) next.set('due', preset.dueDate)
        if (open && preset.assignToMe) next.set('assign', 'me')
        return next
      },
      { replace: true }
    )
  }
  return {
    creating: params.get('new') === 'task',
    preset: {
      dueDate: due !== null && isDay(due) ? due : undefined,
      assignToMe: params.get('assign') === 'me'
    },
    openNewTask: preset => {
      set(true, preset)
    },
    closeNewTask: () => {
      set(false)
    }
  }
}
