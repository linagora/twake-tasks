import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNull,
  lt,
  ne,
  notExists,
  or,
  sql,
  type SQL
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Db, Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { userSettings } from '../settings/schema.ts'
import { memberLooks, settingsOfMember } from './access.ts'
import { shift, todayIn } from './recurrence.ts'
import {
  boards,
  labels,
  projectMembers,
  projects,
  savedFilters,
  sections,
  type GROUPINGS,
  taskAssignees,
  taskLabels,
  tasks
} from './schema.ts'
import type { Layout } from './layouts.ts'
import { liveTasksOf } from './store.ts'
import { Refused, writeOrRefuse } from './tasks.ts'

type Due = 'overdue' | 'today' | 'week' | 'none'

/**
 * What a view keeps to. Each criterion holds any number of values, of which a
 * task matches one; a task matches every criterion set. An assignee is a
 * person's id, `me` or `nobody`.
 */
export interface Criteria {
  assignees?: string[] | undefined
  priorities?: number[] | undefined
  labels?: string[] | undefined
  dues?: Due[] | undefined
  boards?: string[] | undefined
  /** Names of sections, which match those of any board in any case. */
  statuses?: string[] | undefined
}

/**
 * The names saved filters gave their criteria: one value each at first, then
 * a list of them.
 */
export interface LegacyCriteria {
  assignee?: string | string[] | undefined
  priority?: number | number[] | undefined
  label?: string | string[] | undefined
  due?: Due | Due[] | undefined
  board?: string | undefined
}

const listOf = <T>(many: T[] | undefined, one: T | T[] | undefined): T[] =>
  many ?? (one === undefined ? [] : Array.isArray(one) ? one : [one])

/** The criteria of a view, each with its values, whenever it was saved. */
export function criteriaOf(stored: Criteria & LegacyCriteria): Criteria {
  const set = <T>(values: T[]) => (values.length > 0 ? values : undefined)
  // A criterion not set is left out once stored or sent, as JSON.
  return {
    assignees: set(listOf(stored.assignees, stored.assignee)),
    priorities: set(listOf(stored.priorities, stored.priority)),
    labels: set(listOf(stored.labels, stored.label)),
    dues: set(listOf(stored.dues, stored.due)),
    boards: set(listOf(stored.boards, stored.board)),
    statuses: set(stored.statuses ?? [])
  }
}

const anyOf = (conditions: (SQL | undefined)[]) => {
  const set = conditions.filter(condition => condition !== undefined)
  return set.length === 0 ? undefined : or(...set)
}

function dueIs(due: Due, today: string) {
  switch (due) {
    case 'overdue':
      return lt(tasks.dueDate, today)
    case 'today':
      return eq(tasks.dueDate, today)
    case 'week':
      return and(
        gte(tasks.dueDate, today),
        lt(tasks.dueDate, shift(today, 7, 'days'))
      )
    case 'none':
      return isNull(tasks.dueDate)
  }
}

function matching(tx: Tx, userId: string, criteria: Criteria, today: string) {
  const {
    assignees = [],
    priorities = [],
    labels: names = [],
    dues = [],
    boards: boardIds = [],
    statuses = []
  } = criteria
  const people = assignees
    .filter(assignee => assignee !== 'nobody')
    .map(assignee => (assignee === 'me' ? userId : assignee))
  return and(
    boardIds.length === 0 ? undefined : inArray(tasks.boardId, boardIds),
    anyOf([
      people.length === 0
        ? undefined
        : exists(
            tx
              .select({ one: sql`1` })
              .from(taskAssignees)
              .where(
                and(
                  eq(taskAssignees.taskId, tasks.id),
                  inArray(taskAssignees.userId, people)
                )
              )
          ),
      assignees.includes('nobody')
        ? notExists(
            tx
              .select({ one: sql`1` })
              .from(taskAssignees)
              .where(eq(taskAssignees.taskId, tasks.id))
          )
        : undefined
    ]),
    priorities.length === 0 ? undefined : inArray(tasks.priority, priorities),
    names.length === 0
      ? undefined
      : exists(
          tx
            .select({ one: sql`1` })
            .from(taskLabels)
            .innerJoin(labels, eq(labels.id, taskLabels.labelId))
            .where(
              and(
                eq(taskLabels.taskId, tasks.id),
                inArray(
                  sql`lower(${labels.name})`,
                  names.map(name => name.toLowerCase())
                )
              )
            )
        ),
    anyOf(dues.map(due => dueIs(due, today))),
    statuses.length === 0
      ? undefined
      : exists(
          tx
            .select({ one: sql`1` })
            .from(sections)
            .where(
              and(
                eq(sections.id, tasks.sectionId),
                inArray(
                  sql`lower(trim(${sections.name}))`,
                  statuses.map(name => name.trim().toLowerCase())
                )
              )
            )
        )
  )
}

/** What a person sets of a view: its name, icon, layout, grouping and criteria. */
export interface View {
  name: string
  criteria: Criteria
  icon: string | null
  layout: Layout
  groupBy: (typeof GROUPINGS)[number]
  allColumns: boolean
}

export function createFilterStore(db: Db) {
  return {
    listFilters(identity: Identity) {
      return writeOrRefuse(db, identity, async tx => {
        const rows = await tx
          .select({
            id: savedFilters.id,
            name: savedFilters.name,
            criteria: savedFilters.criteria,
            favorite: savedFilters.favorite,
            icon: savedFilters.icon,
            layout: savedFilters.layout,
            groupBy: savedFilters.groupBy,
            allColumns: savedFilters.allColumns
          })
          .from(savedFilters)
          .orderBy(
            desc(savedFilters.favorite),
            asc(savedFilters.name),
            asc(savedFilters.id)
          )
        return rows.map(row => ({
          ...row,
          criteria: criteriaOf(row.criteria as Criteria & LegacyCriteria)
        }))
      })
    },

    createFilter(identity: Identity, view: View) {
      return writeOrRefuse(db, identity, async tx => {
        const [row] = await tx
          .insert(savedFilters)
          .values({
            organizationId: identity.organizationId,
            userId: identity.userId,
            ...view
          })
          .returning({ id: savedFilters.id })
        if (!row) throw new Error('filter insert returned nothing')
        return row
      })
    },

    // A label criterion matches any case, so names differing only by case are
    // one, in a colour one of them was given if any.
    labelChoices(identity: Identity) {
      return writeOrRefuse(db, identity, async tx => {
        const rows = await tx
          .selectDistinctOn([sql`lower(${labels.name})`], {
            name: labels.name,
            color: labels.color
          })
          .from(labels)
          .innerJoin(
            projects,
            and(eq(projects.id, labels.projectId), isNull(projects.deletedAt))
          )
          .innerJoin(
            projectMembers,
            and(
              eq(projectMembers.projectId, projects.id),
              eq(projectMembers.userId, identity.userId)
            )
          )
          .orderBy(
            sql`lower(${labels.name})`,
            sql`${labels.name} collate "C" desc`,
            sql`${labels.color} nulls last`
          )
        return rows
      })
    },

    // The sections of my open boards, one per name regardless of case.
    statusNames(identity: Identity) {
      return writeOrRefuse(db, identity, async tx => {
        const rows = await tx
          .selectDistinctOn([sql`lower(trim(${sections.name}))`], {
            name: sql<string>`trim(${sections.name})`
          })
          .from(sections)
          .innerJoin(
            boards,
            and(eq(boards.id, sections.boardId), isNull(boards.archivedAt))
          )
          .innerJoin(
            projects,
            and(eq(projects.id, boards.projectId), isNull(projects.deletedAt))
          )
          .innerJoin(
            projectMembers,
            and(
              eq(projectMembers.projectId, projects.id),
              eq(projectMembers.userId, identity.userId)
            )
          )
          .orderBy(
            sql`lower(trim(${sections.name}))`,
            sql`trim(${sections.name}) collate "C" desc`
          )
        return rows.map(row => row.name)
      })
    },

    people(identity: Identity) {
      const mine = alias(projectMembers, 'mine')
      return writeOrRefuse(db, identity, async tx => {
        const rows = await tx
          .selectDistinctOn([projectMembers.userId], {
            userId: projectMembers.userId,
            email: projectMembers.email,
            ...memberLooks
          })
          .from(projectMembers)
          .innerJoin(
            projects,
            and(
              eq(projects.id, projectMembers.projectId),
              isNull(projects.deletedAt)
            )
          )
          .innerJoin(
            mine,
            and(
              eq(mine.projectId, projects.id),
              eq(mine.userId, identity.userId)
            )
          )
          .leftJoin(userSettings, settingsOfMember)
          .where(ne(projectMembers.userId, identity.userId))
          .orderBy(projectMembers.userId, desc(projectMembers.joinedAt))
        return rows.sort((a, b) => a.email.localeCompare(b.email))
      })
    },

    updateFilter(
      identity: Identity,
      filterId: string,
      changes: { [Key in keyof View]?: View[Key] | undefined } & {
        favorite?: boolean | undefined
      }
    ) {
      return writeOrRefuse(db, identity, async tx => {
        const updated = await tx
          .update(savedFilters)
          .set(changes)
          .where(eq(savedFilters.id, filterId))
          .returning({ id: savedFilters.id })
        if (updated.length === 0) throw new Refused('not_found')
      })
    },

    deleteFilter(identity: Identity, filterId: string) {
      return writeOrRefuse(db, identity, async tx => {
        const deleted = await tx
          .delete(savedFilters)
          .where(eq(savedFilters.id, filterId))
          .returning({ id: savedFilters.id })
        if (deleted.length === 0) throw new Refused('not_found')
      })
    },

    filteredTasks(identity: Identity, filterId: string, zone: string) {
      return writeOrRefuse(db, identity, async tx => {
        const [filter] = await tx
          .select()
          .from(savedFilters)
          .where(eq(savedFilters.id, filterId))
        if (!filter) throw new Refused('not_found')
        return liveTasksOf(
          tx,
          identity.userId,
          matching(
            tx,
            identity.userId,
            criteriaOf(filter.criteria as Criteria & LegacyCriteria),
            todayIn(zone)
          )
        )
      })
    }
  }
}
