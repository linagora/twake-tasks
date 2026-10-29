import { and, eq, isNull } from 'drizzle-orm'
import { generateKeyBetween } from 'fractional-indexing'
import type { Tx } from '../../infra/db.ts'
import { Refused } from '../kernel/index.ts'
import { sections, tasks } from './schema.ts'

export function completionFor(
  category: string | null,
  since?: { completedAt: Date | null; canceledAt: Date | null }
) {
  return {
    completedAt:
      category === 'completed' ? (since?.completedAt ?? new Date()) : null,
    canceledAt:
      category === 'canceled' ? (since?.canceledAt ?? new Date()) : null
  }
}

// Neighbours come from what the client saw. When they no longer sit next to
// each other the board changed underneath, so the client reloads and retries.
// Archived and trashed tasks keep their place between the ones it saw.
export function positionBetween(
  others: { id: string; position: string; hidden?: boolean }[],
  afterId: string | undefined,
  beforeId: string | undefined
): string {
  const after = afterId ? others.findIndex(task => task.id === afterId) : -1
  const before = beforeId ? others.findIndex(task => task.id === beforeId) : -1
  if ((afterId && after < 0) || (beforeId && before < 0)) {
    throw new Refused('stale_neighbours')
  }
  if (
    afterId &&
    beforeId &&
    (before <= after ||
      others.slice(after + 1, before).some(task => !task.hidden))
  ) {
    throw new Refused('stale_neighbours')
  }
  const lower = afterId
    ? others[after]
    : beforeId
      ? others[before - 1]
      : others.at(-1)
  const upper = afterId ? others[after + 1] : beforeId ? others[before] : null
  return generateKeyBetween(lower?.position ?? null, upper?.position ?? null)
}

export async function sectionOf(
  tx: Tx,
  boardId: string,
  sectionId: string | null
) {
  if (sectionId === null) return null
  const [section] = await tx
    .select()
    .from(sections)
    .where(and(eq(sections.id, sectionId), eq(sections.boardId, boardId)))
  if (!section) throw new Refused('invalid_section')
  return section
}

export async function taskOf(tx: Tx, boardId: string, taskId: string) {
  const [task] = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.boardId, boardId)))
  if (!task) throw new Refused('not_found')
  return task
}

// Archived and trashed tasks stay read only until they are restored.
export async function shownTaskOf(tx: Tx, boardId: string, taskId: string) {
  const task = await taskOf(tx, boardId, taskId)
  if (task.archivedAt || task.deletedAt) throw new Refused('archived')
  return task
}

export function inSection(boardId: string, sectionId: string | null) {
  return and(
    eq(tasks.boardId, boardId),
    isNull(tasks.parentId),
    sectionId === null
      ? isNull(tasks.sectionId)
      : eq(tasks.sectionId, sectionId)
  )
}
