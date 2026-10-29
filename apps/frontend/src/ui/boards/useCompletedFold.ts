import { useState } from 'react'

const keyOf = (boardId: string) => `twake-tasks.completedFold.${boardId}`

function stored(boardId: string): boolean {
  try {
    return localStorage.getItem(keyOf(boardId)) === 'open'
  } catch {
    return false
  }
}

/** Whether the completed tasks of a board show, remembered on this device. */
export function useCompletedFold(boardId: string): {
  expanded: boolean
  toggle: () => void
} {
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const expanded = shown[boardId] ?? stored(boardId)
  const toggle = () => {
    const next = !expanded
    setShown(current => ({ ...current, [boardId]: next }))
    try {
      if (next) localStorage.setItem(keyOf(boardId), 'open')
      else localStorage.removeItem(keyOf(boardId))
    } catch {
      // Private browsing: the fold stays as set until the page closes.
    }
  }
  return { expanded, toggle }
}
