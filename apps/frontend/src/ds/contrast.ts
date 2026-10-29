import { useSyncExternalStore } from 'react'

export type ContrastChoice = 'high' | 'standard'

// White initials read at 10.8:1 on the people, 8.6:1 on the boards
export const HIGH_CONTRAST_AVATAR = '#3D3D42'
export const HIGH_CONTRAST_BADGE = '#0047A3'

const KEY = 'twake-tasks:contrast'
const SYSTEM = ['(prefers-contrast: more)', '(forced-colors: active)']

const listeners = new Set<() => void>()
// Used when the storage is blocked or full, so that the switch still works
// until a reload.
let unsaved: ContrastChoice | null = null

function readChoice(): ContrastChoice | null {
  if (unsaved !== null) return unsaved
  try {
    const value = localStorage.getItem(KEY)
    return value === 'high' || value === 'standard' ? value : null
  } catch {
    return null
  }
}

const notify = (): void => {
  listeners.forEach(listener => {
    listener()
  })
}

const systemQueries = (): MediaQueryList[] =>
  typeof window.matchMedia === 'function'
    ? SYSTEM.map(query => window.matchMedia(query))
    : []

// Every chip and avatar reads the mode: one watch of the system for them all,
// while any is mounted.
let watched: { high: boolean; stop: () => void } | null = null

const systemAsksHigh = (): boolean =>
  watched ? watched.high : systemQueries().some(query => query.matches)

function watchSystem(): { high: boolean; stop: () => void } {
  const queries = systemQueries()
  const update = (): void => {
    if (watched) watched.high = queries.some(query => query.matches)
    notify()
  }
  queries.forEach(query => {
    query.addEventListener('change', update)
  })
  window.addEventListener('storage', notify)
  return {
    high: queries.some(query => query.matches),
    stop: () => {
      queries.forEach(query => {
        query.removeEventListener('change', update)
      })
      window.removeEventListener('storage', notify)
    }
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  watched ??= watchSystem()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      watched?.stop()
      watched = null
    }
  }
}

function setChoice(choice: ContrastChoice): void {
  try {
    localStorage.setItem(KEY, choice)
    unsaved = null
  } catch {
    unsaved = choice
  }
  notify()
}

/**
 * The high-contrast mode, chosen on this device or, with no choice made,
 * asked by the system's "increase contrast" or forced colours.
 */
export function useContrast(): {
  high: boolean
  setChoice: (choice: ContrastChoice) => void
} {
  const choice = useSyncExternalStore(subscribe, readChoice)
  const system = useSyncExternalStore(subscribe, systemAsksHigh)
  return { high: choice === null ? system : choice === 'high', setChoice }
}
