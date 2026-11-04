import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent
} from 'react'

import type { KeySelect } from '@/ds/Columns'
import type { Task } from '@/domain/board'
import { useI18n } from '@/ui/i18n/useI18n'

export interface Selection {
  /** The picked tasks still on the board, in board order. */
  ids: string[]
  has: (taskId: string) => boolean
  /** With `range`, also picks the tasks of its section since the last one picked. */
  toggle: (taskId: string, range?: boolean) => void
  /** Picks only these, the ones a change could not reach. */
  keep: (taskIds: string[]) => void
  clear: () => void
}

/** Null where tasks cannot be picked: for viewers, and in the calendar. */
export const SelectionContext = createContext<Selection | null>(null)

/** `lanes` holds the ids of each section's tasks, in the order they show. */
export function useBoardSelection(lanes: string[][]): Selection {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const anchor = useRef<string | null>(null)
  const ids = lanes.flat().filter(id => picked.has(id))
  const clear = () => {
    anchor.current = null
    setPicked(new Set())
  }

  // A menu or dialog open over the board takes its own Escape.
  const picking = ids.length > 0
  useEffect(() => {
    if (!picking) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        anchor.current = null
        setPicked(new Set())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [picking])

  return {
    ids,
    has: taskId => picked.has(taskId),
    toggle: (taskId, range = false) => {
      const lane = lanes.find(each => each.includes(taskId)) ?? []
      const from = anchor.current === null ? -1 : lane.indexOf(anchor.current)
      const to = lane.indexOf(taskId)
      const next = new Set(picked)
      if (range && from >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from]
        for (const id of lane.slice(start, end + 1)) next.add(id)
      } else if (!next.delete(taskId)) next.add(taskId)
      anchor.current = taskId
      setPicked(next)
    },
    keep: taskIds => {
      setPicked(new Set(taskIds))
    },
    clear
  }
}

/** The task's check box, where tasks can be picked. */
export function useKeySelect(task: Task): KeySelect | undefined {
  const { t } = useI18n()
  const selection = useContext(SelectionContext)
  if (!selection) return undefined
  return {
    label: t('bulk.select', { key: task.key }),
    checked: selection.has(task.id),
    onToggle: range => {
      selection.toggle(task.id, range)
    },
    selecting: selection.ids.length > 0
  }
}

/**
 * Ctrl or Cmd+click picks the task, and Shift+click the ones since the last
 * picked; true when the click did.
 */
export function usePickByClick(task: Task): (event: MouseEvent) => boolean {
  const selection = useContext(SelectionContext)
  return event => {
    if (!selection || !(event.ctrlKey || event.metaKey || event.shiftKey)) {
      return false
    }
    event.preventDefault()
    selection.toggle(task.id, event.shiftKey)
    return true
  }
}
