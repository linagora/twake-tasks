import { useState } from 'react'

/**
 * Whether a part of the sidebar is folded, as it is at first, then as the
 * person left it, remembered on this device only, like a filter's layout.
 */
export function useFolded(key: string, foldedAtFirst: boolean) {
  const [folded, setFolded] = useState(() => {
    try {
      const kept = localStorage.getItem(key)
      return kept === null ? foldedAtFirst : kept === 'true'
    } catch {
      return foldedAtFirst
    }
  })
  const toggle = () => {
    setFolded(!folded)
    try {
      localStorage.setItem(key, String(!folded))
    } catch {
      // Private browsing: the choice lasts until the page closes.
    }
  }
  return [folded, toggle] as const
}
