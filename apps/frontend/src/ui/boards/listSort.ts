import { useState } from 'react'

import type { Task } from '@/domain/board'

export type SortKey = 'title' | 'due' | 'priority'
export type ListSort = { key: SortKey; descending: boolean } | null

const KEYS: readonly SortKey[] = ['title', 'due', 'priority']

/** Ascending, then descending, then back to the board's order. */
function nextSort(sort: ListSort, key: SortKey): ListSort {
  if (sort?.key !== key) return { key, descending: false }
  return sort.descending ? null : { key, descending: true }
}

const valueOf = (task: Task, key: SortKey): string | number | null => {
  if (key === 'title') return task.title
  if (key === 'priority') return task.priority
  return task.dueDate && `${task.dueDate} ${task.dueTime ?? ''}`
}

/** Tasks without the value come last either way; ties keep board order. */
export function sortTasks(tasks: Task[], sort: ListSort, lang: string): Task[] {
  if (!sort) return tasks
  const collator = new Intl.Collator(lang, {
    sensitivity: 'base',
    numeric: true
  })
  const direction = sort.descending ? -1 : 1
  return tasks.toSorted((a, b) => {
    const left = valueOf(a, sort.key)
    const right = valueOf(b, sort.key)
    if (left === null || right === null) {
      return Number(left === null) - Number(right === null)
    }
    return (
      direction *
      (typeof left === 'string' && typeof right === 'string'
        ? collator.compare(left, right)
        : Number(left) - Number(right))
    )
  })
}

const keyOf = (boardId: string) => `twake-tasks.listSort.${boardId}`

function stored(boardId: string): ListSort {
  try {
    const [key, order] = (localStorage.getItem(keyOf(boardId)) ?? '').split(' ')
    const found = KEYS.find(known => known === key)
    return found ? { key: found, descending: order === 'desc' } : null
  } catch {
    return null
  }
}

/** How a board's list is sorted, remembered on this device. */
export function useListSort(boardId: string): {
  sort: ListSort
  sortBy: (key: SortKey) => void
} {
  const [picked, setPicked] = useState<Record<string, ListSort>>({})
  const sort = boardId in picked ? (picked[boardId] ?? null) : stored(boardId)
  const sortBy = (key: SortKey) => {
    const next = nextSort(sort, key)
    setPicked(current => ({ ...current, [boardId]: next }))
    try {
      if (next) {
        localStorage.setItem(
          keyOf(boardId),
          `${next.key} ${next.descending ? 'desc' : 'asc'}`
        )
      } else localStorage.removeItem(keyOf(boardId))
    } catch {
      // Private browsing: the sort stays as set until the page closes.
    }
  }
  return { sort, sortBy }
}
