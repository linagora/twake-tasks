import {
  and,
  asc,
  eq,
  exists,
  inArray,
  isNull,
  lt,
  notExists,
  or,
  sql,
  type AnyColumn,
  type SQL
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { inTenant, type Db, type Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { accessibleBoards, membersOf } from '../boards/access.ts'
import { describeTasks, shown } from '../boards/describe.ts'
import { labelsOn } from '../boards/labels.ts'
import { shift, todayIn } from '../boards/recurrence.ts'
import {
  boards,
  projects,
  sections,
  taskAssignees,
  tasks
} from '../boards/schema.ts'

const SEARCH_LIMIT = 50

const WORDS_BEFORE = 5
const WORDS_AFTER = 8

// Letters unaccent rewrites that have no canonical decomposition.
const UNACCENT_LETTERS: Record<string, string> = {
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
  ø: 'o',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ħ: 'h',
  ı: 'i',
  ŀ: 'l',
  ﬀ: 'ff',
  ﬁ: 'fi',
  ﬂ: 'fl',
  ﬃ: 'ffi',
  ﬄ: 'ffl'
}

/** Lower case, without accents, as unaccent compares in the database. */
const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\P{ASCII}/gu, letter => UNACCENT_LETTERS[letter] ?? letter)

const accentless = (column: SQL | AnyColumn, pattern: string) =>
  sql`unaccent(${column}) ilike unaccent(${pattern})`

function excerptOf(description: string, folded: string): string | null {
  const words = description.split(/\s+/).filter(Boolean)
  // Each word folded on its own keeps the words in place, whatever their length.
  const joined = words.map(fold).join(' ')
  const at = joined.indexOf(folded)
  if (at === -1) return null
  const wordAt = (offset: number) =>
    joined.slice(0, offset).split(' ').length - 1
  const from = Math.max(0, wordAt(at) - WORDS_BEFORE)
  const to = Math.min(
    words.length,
    wordAt(at + folded.length) + 1 + WORDS_AFTER
  )
  return `${from > 0 ? '…' : ''}${words.slice(from, to).join(' ')}${to < words.length ? '…' : ''}`
}

interface SearchMatch {
  field: 'key' | 'previousKey' | 'title' | 'description'
  text: string
}

function matchOf(
  task: { key?: string | undefined; title?: string | null | undefined },
  previousKeys: string[],
  excerpt: string | null,
  lower: string,
  inTitle: boolean
): SearchMatch | null {
  // Keys compare with ilike in the database, without unaccent.
  if (task.key?.toLowerCase().startsWith(lower)) {
    return { field: 'key', text: task.key }
  }
  const previous = previousKeys.find(key => key.toLowerCase().startsWith(lower))
  if (previous) return { field: 'previousKey', text: previous }
  if (task.title && inTitle) return { field: 'title', text: task.title }
  return excerpt ? { field: 'description', text: excerpt } : null
}

export function createViewStore(db: Db) {
  return {
    /** Overdue tasks, then those due within `days` days of today in `zone`. */
    agenda(identity: Identity, zone: string, days: number) {
      return inTenant(db, identity, async tx => {
        const today = todayIn(zone)
        return {
          today,
          tasks: await openTasksOf(
            tx,
            identity.userId,
            and(
              lt(tasks.dueDate, shift(today, days, 'days')),
              mine(tx, identity.userId)
            )
          )
        }
      })
    },

    /** Open tasks assigned to the person, dated ones first. */
    assignedTasks(identity: Identity) {
      return inTenant(db, identity, tx =>
        openTasksOf(tx, identity.userId, assignedTo(tx, identity.userId))
      )
    },

    /**
     * Tasks whose key starts with, or whose title or description contains,
     * `text`, whatever the case and accents, an exact key match first.
     */
    search(identity: Identity, text: string) {
      const pattern = text.replace(/[\\%_]/g, '\\$&')
      const keyMatches = (keyPattern: string) =>
        sql`(${boards.keyPrefix} || '-' || ${tasks.number} ilike ${keyPattern}
          or exists (select 1 from unnest(${tasks.previousKeys}) as key where key ilike ${keyPattern}))`
      return inTenant(db, identity, async tx => {
        // No index serves ilike under row level security, so the person's
        // boards are read first: the planner then scans only their tasks,
        // not every task of the organization.
        const accessible = accessibleBoards(tx, identity.userId)
        const boardIds = (
          await tx.select({ id: accessible.boardId }).from(accessible)
        ).map(board => board.id)
        const found = await tasksOf(
          tx,
          identity.userId,
          and(
            inArray(tasks.boardId, boardIds),
            or(
              keyMatches(`${pattern}%`),
              accentless(tasks.title, `%${pattern}%`),
              accentless(tasks.descriptionText, `%${pattern}%`)
            )
          ),
          SEARCH_LIMIT,
          sql`${keyMatches(pattern)} desc`
        )
        const lower = text.toLowerCase()
        const folded = fold(text)
        const ids = found.flatMap(task => (task.id ? [task.id] : []))
        const fields = new Map(
          ids.length === 0
            ? []
            : (
                await tx
                  .select({
                    id: tasks.id,
                    description: tasks.descriptionText,
                    previousKeys: tasks.previousKeys
                  })
                  .from(tasks)
                  .where(inArray(tasks.id, ids))
              ).map(row => [row.id, row])
        )
        return found.map(task => {
          const { description = '', previousKeys = [] } =
            fields.get(task.id ?? '') ?? {}
          const inTitle = !!task.title && fold(task.title).includes(folded)
          const excerpt = inTitle ? null : excerptOf(description, folded)
          return {
            ...task,
            excerpt,
            match: matchOf(task, previousKeys, excerpt, lower, inTitle)
          }
        })
      })
    }
  }
}

export const assignedTo = (tx: Tx, userId: string) =>
  exists(
    tx
      .select({ one: sql`1` })
      .from(taskAssignees)
      .where(
        and(
          eq(taskAssignees.taskId, tasks.id),
          eq(taskAssignees.userId, userId)
        )
      )
  )

// A task is someone's when it is assigned to them, or when it sits unassigned
// in one of their own projects. Unassigned tasks of a managed project belong
// to nobody yet.
const mine = (tx: Tx, userId: string) =>
  or(
    assignedTo(tx, userId),
    and(
      eq(projects.managed, false),
      notExists(
        tx
          .select({ one: sql`1` })
          .from(taskAssignees)
          .where(eq(taskAssignees.taskId, tasks.id))
      )
    )
  )

export function openTasksOf(tx: Tx, userId: string, which: SQL | undefined) {
  return tasksOf(
    tx,
    userId,
    and(
      isNull(boards.archivedAt),
      isNull(tasks.completedAt),
      isNull(tasks.canceledAt),
      which
    )
  )
}

async function tasksOf(
  tx: Tx,
  userId: string,
  which: SQL | undefined,
  limit?: number,
  first?: SQL
) {
  const accessible = accessibleBoards(tx, userId)
  const parent = alias(tasks, 'parent')
  const query = tx
    .select({
      task: tasks,
      board: boards,
      category: sections.category,
      parentTitle: parent.title
    })
    .from(tasks)
    .innerJoin(boards, eq(boards.id, tasks.boardId))
    .innerJoin(projects, eq(projects.id, boards.projectId))
    .innerJoin(accessible, eq(accessible.boardId, boards.id))
    .leftJoin(sections, eq(sections.id, tasks.sectionId))
    .leftJoin(parent, eq(parent.id, tasks.parentId))
    .where(and(shown, which))
    .orderBy(
      ...(first ? [first] : []),
      sql`${tasks.dueDate} asc nulls last`,
      sql`${tasks.dueTime} asc nulls last`,
      sql`${tasks.priority} asc nulls last`,
      asc(boards.name),
      asc(tasks.number)
    )
  const rows = await (limit === undefined ? query : query.limit(limit))
  const described = new Map<string, Awaited<ReturnType<typeof describeTasks>>>()
  for (const board of new Map(
    rows.map(row => [row.board.id, row.board])
  ).values()) {
    described.set(
      board.id,
      await describeTasks(
        tx,
        board,
        rows.filter(row => row.board.id === board.id).map(row => row.task),
        await membersOf(tx, board),
        await labelsOn(tx, board)
      )
    )
  }
  return rows.map(({ task, board, category, parentTitle }) => ({
    ...described.get(board.id)?.find(each => each.id === task.id),
    category,
    parentTitle,
    boardId: board.id,
    boardName: board.name,
    projectId: board.projectId
  }))
}
