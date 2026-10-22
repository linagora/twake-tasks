import type { SectionMove } from '@/application/boards'

/** The order of the sections once `activeId` takes the place of `overId`. */
export function reorder(
  order: string[],
  activeId: string,
  overId: string
): string[] {
  const from = order.indexOf(activeId)
  const to = order.indexOf(overId)
  if (from < 0 || to < 0 || from === to) return order
  const rest = order.filter(id => id !== activeId)
  return [...rest.slice(0, to), activeId, ...rest.slice(to)]
}

/** Where the section goes, as the server places it; null if it stays. */
export function columnMove(
  order: string[],
  activeId: string,
  overId: string
): SectionMove | null {
  const moved = reorder(order, activeId, overId)
  if (moved === order) return null
  const at = moved.indexOf(activeId)
  const after = moved[at - 1]
  const before = moved[at + 1]
  if (after !== undefined) return { afterId: after }
  return before === undefined ? null : { beforeId: before }
}
