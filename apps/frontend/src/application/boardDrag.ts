/** Task ids per column, keyed so a key never matches a task id. */
export type Lanes = Record<string, string[]>

export function laneOf(lanes: Lanes, id: string): string | undefined {
  return id in lanes
    ? id
    : Object.keys(lanes).find(key => lanes[key]?.includes(id))
}

export function enterLane(
  lanes: Lanes,
  activeId: string,
  overId: string,
  below: boolean
): Lanes {
  const from = laneOf(lanes, activeId)
  const to = laneOf(lanes, overId)
  if (from === undefined || to === undefined || from === to) return lanes
  const target = lanes[to] ?? []
  const at = target.indexOf(overId)
  const index = at < 0 ? target.length : at + (below ? 1 : 0)
  return {
    ...lanes,
    [from]: (lanes[from] ?? []).filter(id => id !== activeId),
    [to]: [...target.slice(0, index), activeId, ...target.slice(index)]
  }
}

/** `ids` is the lane the task lands in, without the task. */
export function dropOn(
  before: Lanes,
  lanes: Lanes,
  activeId: string,
  overId: string
): { lane: string; ids: string[]; index: number } | null {
  const lane = laneOf(lanes, activeId)
  if (lane === undefined) return null
  const list = lanes[lane] ?? []
  const from = list.indexOf(activeId)
  const over = list.indexOf(overId)
  const index = laneOf(lanes, overId) === lane && over >= 0 ? over : from
  const start = laneOf(before, activeId)
  if (start === lane && (before[lane] ?? []).indexOf(activeId) === index) {
    return null
  }
  return { lane, ids: list.filter(id => id !== activeId), index }
}
