import { createContext, useContext, useEffect } from 'react'

/** What a key does in an open task. */
export const TASK_KEYS = {
  a: 'assign',
  l: 'label',
  e: 'describe',
  c: 'comment',
  x: 'complete',
  m: 'move'
} as const

export type TaskAction = (typeof TASK_KEYS)[keyof typeof TASK_KEYS]

/** The keys of an open task, to show beside the buttons they press. */
export const keyOf = (action: TaskAction): string =>
  Object.entries(TASK_KEYS)
    .find(([, each]) => each === action)?.[0]
    .toUpperCase() ?? ''

export type TaskShortcuts = Map<TaskAction, () => void>

/** The actions an open task's parts offer to its keys. */
export const TaskShortcutsContext = createContext<TaskShortcuts | null>(null)

/** Offers an action of the open task to its key. */
export function useTaskShortcut(action: TaskAction, run: () => void): void {
  const shortcuts = useContext(TaskShortcutsContext)
  useEffect(() => {
    if (!shortcuts) return
    shortcuts.set(action, run)
    return () => {
      if (shortcuts.get(action) === run) shortcuts.delete(action)
    }
  })
}

// The open tasks, the last on top: only it answers keys.
const open: symbol[] = []

export function openTask(id: symbol): () => void {
  open.push(id)
  return () => {
    open.splice(open.indexOf(id), 1)
  }
}

export const onTop = (id: symbol): boolean => open.at(-1) === id

export const anyTaskOpen = (): boolean => open.length > 0

export const typing = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
