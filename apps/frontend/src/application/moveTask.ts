import type { TaskMove } from '@/application/boards'
import type { Task } from '@/domain/board'

/** `ids` is the target column without the moved task. */
export function moveInto(
  sectionId: string | null,
  ids: string[],
  index: number
): TaskMove {
  const afterId = ids[index - 1]
  const beforeId = ids[index]
  return {
    sectionId,
    ...(afterId !== undefined && { afterId }),
    ...(beforeId !== undefined && { beforeId })
  }
}

export function applyMove<T extends Pick<Task, 'id' | 'sectionId'>>(
  tasks: T[],
  taskId: string,
  move: TaskMove
): T[] {
  const task = tasks.find(each => each.id === taskId)
  if (!task) return tasks
  const rest = tasks.filter(each => each !== task)
  const moved = { ...task, sectionId: move.sectionId }
  const anchor = move.afterId ?? move.beforeId
  const at = rest.findIndex(each => each.id === anchor)
  if (at < 0) return [...rest, moved]
  const index = move.afterId === undefined ? at : at + 1
  return [...rest.slice(0, index), moved, ...rest.slice(index)]
}
