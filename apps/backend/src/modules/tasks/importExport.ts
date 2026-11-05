import { labelName, sectionName } from '@twake-tasks/api-contract'
import type * as wire from '@twake-tasks/api-contract'
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { generateNKeysBetween } from 'fractional-indexing'
import type { z } from 'zod'
import type { Db, Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import {
  boards,
  bumpBoard,
  checkRole,
  completionFor,
  describeTasks,
  inSection,
  labels,
  labelsOn,
  membersOf,
  roleOn,
  sections,
  taskAssignees,
  taskLabels,
  tasks
} from '../boards/index.ts'
import { Refused, writeOrRefuse } from '../kernel/index.ts'
import { plainText } from './markdown.ts'
import { MAX_DEPTH } from './tasks.ts'

type ImportRow = z.output<typeof wire.importRow>

type Parent = { row: number } | { id: string } | null

interface Place {
  depth: number
  parent: Parent
}

// Below the 65 535 parameters of one statement.
const CHUNK = 5000

async function insertChunked<T>(
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>
) {
  for (let at = 0; at < rows.length; at += CHUNK) {
    await insert(rows.slice(at, at + CHUNK))
  }
}

const folded = (name: string) => name.toLowerCase()

function distinct(names: string[]): string[] {
  const seen = new Map<string, string>()
  for (const name of names) {
    if (!seen.has(folded(name))) seen.set(folded(name), name)
  }
  return [...seen.values()]
}

// The board's tasks that the file's parent keys name, with their depth.
async function existingParents(
  tx: Tx,
  boardId: string,
  keyPrefix: string,
  keys: string[]
) {
  const numbers = new Map<number, string>()
  for (const key of keys) {
    const match = /^([A-Z0-9]+)-(\d+)$/i.exec(key)
    if (match?.[1]?.toUpperCase() === keyPrefix) {
      numbers.set(Number(match[2]), key)
    }
  }
  if (numbers.size === 0) return new Map<string, Place & { id: string }>()
  const found = await tx
    .select({ id: tasks.id, number: tasks.number })
    .from(tasks)
    .where(
      and(
        eq(tasks.boardId, boardId),
        inArray(tasks.number, [...numbers.keys()]),
        isNull(tasks.archivedAt),
        isNull(tasks.deletedAt)
      )
    )
  const depths = await depthsOf(
    tx,
    found.map(task => task.id)
  )
  const byKey = new Map<string, Place & { id: string }>()
  for (const task of found) {
    const key = numbers.get(task.number)
    if (key !== undefined) {
      byKey.set(key, {
        id: task.id,
        depth: depths.get(task.id) ?? 1,
        parent: null
      })
    }
  }
  return byKey
}

// Each task's depth, itself included: a task without a parent is at 1.
async function depthsOf(tx: Tx, ids: string[]) {
  if (ids.length === 0) return new Map<string, number>()
  const rows = await tx.execute<{ id: string; depth: number }>(sql`
    with recursive chain as (
      select ${tasks.id} as start, ${tasks.parentId} as parent_id from ${tasks}
      where ${inArray(tasks.id, ids)}
      union all
      select chain.start, parent.parent_id from ${tasks} parent
      join chain on parent.id = chain.parent_id
    )
    select start as id, count(*)::int as depth from chain group by start`)
  return new Map(rows.map(row => [row.id, row.depth]))
}

// Where each row goes: under no parent, under another row of the file or
// under a task of the board. Null for a row whose parent is missing, too
// deep or part of a loop.
function placeRows(
  rows: ImportRow[],
  onBoard: Map<string, Place & { id: string }>
): (Place | null)[] {
  const byKey = new Map<string, number>()
  rows.forEach((row, index) => {
    if (row.key && !byKey.has(row.key)) byKey.set(row.key, index)
  })
  const places = new Map<number, Place | null>()
  const placeOf = (index: number, visiting: Set<number>): Place | null => {
    const known = places.get(index)
    if (known !== undefined) return known
    const parentKey = rows[index]?.parentKey
    let place: Place | null
    if (!parentKey) place = { depth: 1, parent: null }
    else {
      const inFile = byKey.get(parentKey)
      if (inFile === undefined) {
        const task = onBoard.get(parentKey)
        place = task ? { depth: task.depth + 1, parent: { id: task.id } } : null
      } else if (visiting.has(inFile) || inFile === index) place = null
      else {
        const parent = placeOf(inFile, new Set(visiting).add(index))
        place = parent
          ? { depth: parent.depth + 1, parent: { row: inFile } }
          : null
      }
    }
    if (place && place.depth > MAX_DEPTH) place = null
    places.set(index, place)
    return place
  }
  return rows.map((_, index) => placeOf(index, new Set()))
}

async function ensureSections(
  tx: Tx,
  board: { id: string; organizationId: string | null },
  names: string[],
  mayCreate: boolean
) {
  const sectionsOn = () =>
    tx
      .select({
        id: sections.id,
        name: sections.name,
        category: sections.category,
        position: sections.position
      })
      .from(sections)
      .where(eq(sections.boardId, board.id))
      .orderBy(asc(sections.position))
  const existing = await sectionsOn()
  const byName = new Map(
    existing.map(section => [folded(section.name), section])
  )
  const missing = distinct(names).filter(name => !byName.has(folded(name)))
  if (mayCreate && missing.length > 0) {
    const positions = generateNKeysBetween(
      existing.at(-1)?.position ?? null,
      null,
      missing.length
    )
    // A section of the same name added meanwhile is the one its tasks join.
    await tx
      .insert(sections)
      .values(
        missing.map((name, index) => ({
          boardId: board.id,
          organizationId: board.organizationId,
          name,
          category: 'unstarted' as const,
          position: positions[index] ?? ''
        }))
      )
      .onConflictDoNothing()
    for (const section of await sectionsOn()) {
      byName.set(folded(section.name), section)
    }
  }
  return {
    // Where a new task goes in the app.
    fallback:
      existing.find(section => section.category === 'unstarted') ??
      existing[0] ??
      null,
    named: (name: string) => byName.get(folded(name)),
    unplaced: mayCreate ? [] : missing
  }
}

async function ensureLabels(
  tx: Tx,
  board: { projectId: string; organizationId: string | null },
  names: string[]
) {
  const existing = await labelsOn(tx, board)
  const known = new Set(existing.map(label => folded(label.name)))
  const missing = distinct(names).filter(name => !known.has(folded(name)))
  if (missing.length > 0) {
    await tx
      .insert(labels)
      .values(
        missing.map(name => ({
          organizationId: board.organizationId,
          projectId: board.projectId,
          name,
          color: null
        }))
      )
      .onConflictDoNothing()
  }
  const all = missing.length > 0 ? await labelsOn(tx, board) : existing
  const byName = new Map(all.map(label => [folded(label.name), label.id]))
  return (name: string) => byName.get(folded(name))
}

// A member is named by their email, or by their name when no other member
// shares it.
async function assigneeFinder(tx: Tx, board: { projectId: string }) {
  const members = await membersOf(tx, board)
  const byEmail = new Map(
    members.map(member => [folded(member.email), member.userId])
  )
  const byName = new Map<string, string | null>()
  for (const member of members) {
    if (!member.name) continue
    const name = folded(member.name)
    byName.set(name, byName.has(name) ? null : member.userId)
  }
  return (who: string) =>
    byEmail.get(folded(who)) ?? byName.get(folded(who)) ?? undefined
}

const valid = <T>(schema: z.ZodType<T>, value: string | undefined) => {
  if (value === undefined) return null
  const parsed = schema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function createImportExportStore(db: Db) {
  return {
    exportTasks(identity: Identity, boardId: string, archived: boolean) {
      return writeOrRefuse(db, identity, async tx => {
        if (!(await roleOn(tx, identity.userId, boardId))) {
          throw new Refused('not_found')
        }
        const [board] = await tx
          .select()
          .from(boards)
          .where(eq(boards.id, boardId))
        if (!board) throw new Refused('not_found')
        const order = await tx
          .select({ id: sections.id })
          .from(sections)
          .where(eq(sections.boardId, boardId))
          .orderBy(asc(sections.position))
        const rows = await tx
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.boardId, boardId),
              isNull(tasks.deletedAt),
              archived ? undefined : isNull(tasks.archivedAt)
            )
          )
          .orderBy(asc(tasks.position))
        const members = await membersOf(tx, board)
        const memberById = new Map(
          members.map(member => [member.userId, member])
        )
        const described = await describeTasks(
          tx,
          board,
          rows,
          members,
          await labelsOn(tx, board)
        )
        const rowsById = new Map(rows.map(row => [row.id, row]))
        const entries = described.flatMap(task => {
          const row = rowsById.get(task.id)
          return row
            ? [
                {
                  row,
                  task: {
                    ...task,
                    archived: row.archivedAt !== null,
                    description: row.descriptionText,
                    createdAt: row.createdAt,
                    createdBy: memberById.get(row.createdBy) ?? null
                  }
                }
              ]
            : []
        })
        const ids = new Set(rows.map(row => row.id))
        const children = Map.groupBy(entries, entry => entry.row.parentId)
        const rank = new Map(order.map((section, index) => [section.id, index]))
        const sectionRank = (sectionId: string | null) =>
          sectionId === null ? -1 : (rank.get(sectionId) ?? -1)
        const ordered: (typeof entries)[number]['task'][] = []
        const visit = (entry: (typeof entries)[number]) => {
          ordered.push(entry.task)
          for (const child of children.get(entry.row.id) ?? []) visit(child)
        }
        entries
          .filter(
            entry => entry.row.parentId === null || !ids.has(entry.row.parentId)
          )
          .sort(
            (a, b) =>
              sectionRank(a.row.sectionId) - sectionRank(b.row.sectionId)
          )
          .forEach(visit)
        return { tasks: ordered }
      })
    },

    // One transaction: every row that can be placed is created, or none.
    importTasks(identity: Identity, boardId: string, rows: ImportRow[]) {
      return writeOrRefuse(db, identity, async tx => {
        await checkRole(tx, identity, boardId, 'editor')
        const admin = (await roleOn(tx, identity.userId, boardId)) === 'admin'
        await tx.execute(sql`select set_config('app.importing', 'on', true)`)
        const [found] = await tx
          .select({ keyPrefix: boards.keyPrefix })
          .from(boards)
          .where(eq(boards.id, boardId))
        if (!found) throw new Refused('not_found')
        const places = placeRows(
          rows,
          await existingParents(
            tx,
            boardId,
            found.keyPrefix,
            rows.flatMap(row => row.parentKey ?? [])
          )
        )
        const kept = rows.flatMap((row, index) => {
          const place = places[index]
          return place ? [{ row, index, place }] : []
        })
        const board = await bumpBoard(tx, boardId, {
          taskCounter: sql`${boards.taskCounter} + ${kept.length}`
        })

        const sectionNames = new Map(
          kept.map(({ row, index }) => [index, valid(sectionName, row.section)])
        )
        const boardSections = await ensureSections(
          tx,
          board,
          kept.flatMap(({ index, place }) =>
            place.parent === null ? (sectionNames.get(index) ?? []) : []
          ),
          admin
        )
        const labelNames = new Map(
          kept.map(({ row, index }) => [
            index,
            (row.labels ?? []).flatMap(name => valid(labelName, name) ?? [])
          ])
        )
        const labelFor = await ensureLabels(
          tx,
          board,
          [...labelNames.values()].flat()
        )
        const assigneeFor = await assigneeFinder(tx, board)

        const sectionOfRow = (index: number) => {
          const name = sectionNames.get(index)
          return (
            (name ? boardSections.named(name) : undefined) ??
            boardSections.fallback
          )
        }
        // Each sibling list takes its new tasks after the ones it has.
        const containerOf = ({ index, place }: (typeof kept)[number]) =>
          place.parent === null
            ? `section:${sectionOfRow(index)?.id ?? ''}`
            : 'row' in place.parent
              ? `row:${String(place.parent.row)}`
              : `task:${place.parent.id}`
        const positions = new Map<number, string>()
        for (const [container, siblings] of Map.groupBy(kept, containerOf)) {
          const [kind, id = ''] = container.split(':')
          const [last] =
            kind === 'row'
              ? []
              : await tx
                  .select({ position: tasks.position })
                  .from(tasks)
                  .where(
                    kind === 'section'
                      ? inSection(boardId, id === '' ? null : id)
                      : and(eq(tasks.boardId, boardId), eq(tasks.parentId, id))
                  )
                  .orderBy(desc(tasks.position))
                  .limit(1)
          const keys = generateNKeysBetween(
            last?.position ?? null,
            null,
            siblings.length
          )
          siblings.forEach((sibling, at) => {
            positions.set(sibling.index, keys[at] ?? '')
          })
        }

        const firstNumber = board.number - kept.length + 1
        const numbers = new Map(
          kept.map((entry, at) => [entry.index, firstNumber + at])
        )
        const created = new Map<number, string>()
        for (let depth = 1; depth <= MAX_DEPTH; depth += 1) {
          const level = kept.filter(entry => entry.place.depth === depth)
          if (level.length === 0) continue
          const inserted = await tx
            .insert(tasks)
            .values(
              level.map(({ row, index, place }) => {
                const section =
                  place.parent === null ? sectionOfRow(index) : null
                const description = row.description ?? ''
                return {
                  boardId,
                  sectionId: section?.id ?? null,
                  parentId:
                    place.parent === null
                      ? null
                      : 'row' in place.parent
                        ? (created.get(place.parent.row) ?? null)
                        : place.parent.id,
                  organizationId: board.organizationId,
                  number: numbers.get(index) ?? 0,
                  title: row.title,
                  description,
                  descriptionText: plainText(description),
                  priority: row.priority ?? null,
                  dueDate: row.dueDate ?? null,
                  dueTime: row.dueDate ? (row.dueTime ?? null) : null,
                  position: positions.get(index) ?? '',
                  createdBy: identity.userId,
                  ...completionFor(section?.category ?? null)
                }
              })
            )
            .returning({ id: tasks.id, number: tasks.number })
          const byNumber = new Map(inserted.map(task => [task.number, task.id]))
          for (const { index } of level) {
            const id = byNumber.get(numbers.get(index) ?? 0)
            if (id) created.set(index, id)
          }
        }

        const unknownAssignees: string[] = []
        const assignments = kept.flatMap(({ row, index }) => {
          const userIds = new Set<string>()
          for (const who of row.assignees ?? []) {
            const userId = assigneeFor(who)
            if (userId) userIds.add(userId)
            else if (who !== '') unknownAssignees.push(who)
          }
          return [...userIds].map(userId => ({
            taskId: created.get(index) ?? '',
            organizationId: board.organizationId,
            userId
          }))
        })
        const labelings = kept.flatMap(({ index }) => {
          const labelIds = new Set(
            (labelNames.get(index) ?? []).flatMap(name => labelFor(name) ?? [])
          )
          return [...labelIds].map(labelId => ({
            taskId: created.get(index) ?? '',
            labelId,
            organizationId: board.organizationId
          }))
        })
        await insertChunked(labelings, chunk =>
          tx.insert(taskLabels).values(chunk)
        )
        await insertChunked(assignments, chunk =>
          tx.insert(taskAssignees).values(chunk)
        )

        return {
          imported: kept.length,
          skipped: rows.flatMap((_, index) =>
            places[index] ? [] : [{ row: index, reason: 'parent' as const }]
          ),
          unknownAssignees: distinct(unknownAssignees),
          unplacedSections: boardSections.unplaced
        }
      })
    }
  }
}
