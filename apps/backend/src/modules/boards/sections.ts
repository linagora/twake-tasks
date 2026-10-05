import { and, asc, desc, eq, ne, sql } from 'drizzle-orm'
import { generateNKeysBetween } from 'fractional-indexing'
import type { Db, Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { shown } from './archive.ts'
import { sections, sectionCategory, tasks } from './schema.ts'
import {
  bumpBoard,
  checkRole,
  completionFor,
  inSection,
  positionBetween,
  Refused,
  sectionOf,
  writeOrRefuse
} from './tasks.ts'

type Category = (typeof sectionCategory.enumValues)[number]

async function existingSection(tx: Tx, boardId: string, sectionId: string) {
  const [section] = await tx
    .select()
    .from(sections)
    .where(and(eq(sections.id, sectionId), eq(sections.boardId, boardId)))
  if (!section) throw new Refused('not_found')
  return section
}

function othersOn(tx: Tx, boardId: string, except?: string) {
  return tx
    .select({ id: sections.id, position: sections.position })
    .from(sections)
    .where(
      and(
        eq(sections.boardId, boardId),
        except ? ne(sections.id, except) : undefined
      )
    )
    .orderBy(asc(sections.position))
}

async function moveTasks(
  tx: Tx,
  boardId: string,
  from: string,
  to: string | null
) {
  const target = await sectionOf(tx, boardId, to)
  const moving = await tx
    .select()
    .from(tasks)
    .where(inSection(boardId, from))
    .orderBy(asc(tasks.position))
  const [last] = await tx
    .select({ position: tasks.position })
    .from(tasks)
    .where(inSection(boardId, to))
    .orderBy(desc(tasks.position))
    .limit(1)
  const positions = generateNKeysBetween(
    last?.position ?? null,
    null,
    moving.length
  )
  for (const [index, task] of moving.entries()) {
    await tx
      .update(tasks)
      .set({
        sectionId: to,
        position: positions[index] ?? '',
        ...completionFor(target?.category ?? null, task)
      })
      .where(eq(tasks.id, task.id))
  }
}

export function createSectionStore(db: Db) {
  const write = <T>(identity: Identity, work: (tx: Tx) => Promise<T>) =>
    writeOrRefuse(db, identity, work)

  return {
    createSection(
      identity: Identity,
      boardId: string,
      input: { name: string; category: Category; afterId?: string | undefined }
    ) {
      return write(identity, async tx => {
        await checkRole(tx, identity, boardId, 'admin')
        const board = await bumpBoard(tx, boardId)
        const others = await othersOn(tx, boardId)
        const [section] = await tx
          .insert(sections)
          .values({
            boardId,
            organizationId: board.organizationId,
            name: input.name,
            category: input.category,
            position: positionBetween(others, input.afterId, undefined)
          })
          .returning({
            id: sections.id,
            name: sections.name,
            category: sections.category
          })
        if (!section) throw new Error('section insert returned nothing')
        return section
      })
    },

    editSection(
      identity: Identity,
      boardId: string,
      sectionId: string,
      changes: { name?: string | undefined; category?: Category | undefined }
    ) {
      return write(identity, async tx => {
        await checkRole(tx, identity, boardId, 'admin')
        await bumpBoard(tx, boardId)
        await existingSection(tx, boardId, sectionId)
        await tx.update(sections).set(changes).where(eq(sections.id, sectionId))
        if (changes.category) {
          const { category } = changes
          await tx
            .update(tasks)
            .set({
              completedAt:
                category === 'completed'
                  ? sql`coalesce(${tasks.completedAt}, now())`
                  : null,
              canceledAt:
                category === 'canceled'
                  ? sql`coalesce(${tasks.canceledAt}, now())`
                  : null
            })
            .where(inSection(boardId, sectionId))
        }
        return null
      })
    },

    moveSection(
      identity: Identity,
      boardId: string,
      sectionId: string,
      input: { afterId?: string | undefined; beforeId?: string | undefined }
    ) {
      return write(identity, async tx => {
        await checkRole(tx, identity, boardId, 'admin')
        await bumpBoard(tx, boardId)
        await existingSection(tx, boardId, sectionId)
        const others = await othersOn(tx, boardId, sectionId)
        await tx
          .update(sections)
          .set({
            position: positionBetween(others, input.afterId, input.beforeId)
          })
          .where(eq(sections.id, sectionId))
        return null
      })
    },

    // Without `tasksTo`, only a section with no shown task is deleted, and its
    // archived and trashed tasks go to No section. A null `tasksTo` sends its
    // tasks to No section.
    deleteSection(
      identity: Identity,
      boardId: string,
      sectionId: string,
      tasksTo: string | null | undefined
    ) {
      return write(identity, async tx => {
        await checkRole(tx, identity, boardId, 'admin')
        await bumpBoard(tx, boardId)
        await existingSection(tx, boardId, sectionId)
        if (tasksTo === sectionId) throw new Refused('invalid_section')
        if (tasksTo === undefined) {
          const [task] = await tx
            .select({ id: tasks.id })
            .from(tasks)
            .where(and(inSection(boardId, sectionId), shown))
            .limit(1)
          if (task) throw new Refused('section_not_empty')
        }
        await moveTasks(tx, boardId, sectionId, tasksTo ?? null)
        await tx.delete(sections).where(eq(sections.id, sectionId))
        return null
      })
    }
  }
}
