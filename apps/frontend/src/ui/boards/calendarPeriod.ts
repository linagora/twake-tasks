import { useState } from 'react'

export type CalendarPeriod = 'month' | 'week'

const keyOf = (boardId: string) => `twake-tasks.calendarPeriod.${boardId}`

function stored(boardId: string): CalendarPeriod {
  try {
    return localStorage.getItem(keyOf(boardId)) === 'week' ? 'week' : 'month'
  } catch {
    return 'month'
  }
}

/** Whether a board's calendar shows a month or a week, remembered on this device. */
export function useCalendarPeriod(boardId: string): {
  period: CalendarPeriod
  setPeriod: (period: CalendarPeriod) => void
} {
  const [picked, setPicked] = useState<Record<string, CalendarPeriod>>({})
  const period = picked[boardId] ?? stored(boardId)
  const setPeriod = (next: CalendarPeriod) => {
    setPicked(current => ({ ...current, [boardId]: next }))
    try {
      localStorage.setItem(keyOf(boardId), next)
    } catch {
      // Private browsing: the period stays as set until the page closes.
    }
  }
  return { period, setPeriod }
}
