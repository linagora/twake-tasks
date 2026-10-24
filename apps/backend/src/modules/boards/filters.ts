import {
  and,
  asc,
  eq,
  exists,
  gte,
  inArray,
  isNull,
  lt,
  ne,
  notExists,
  or,
  sql
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Db, Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { userSettings } from '../settings/schema.ts'
import { memberLooks, settingsOfMember } from './access.ts'
import { shift, todayIn } from './recurrence.ts'
import {
  labels,
  projectMembers,
  projects,
  savedFilters,
  taskAssignees,
  taskLabels,
  tasks
} from './schema.ts'
import { assignedTo, openTasksOf } from './store.ts'
import { Refused, writeOrRefuse } from './tasks.ts'

type Due = 'overdue' | 'today' | 'week' | 'none'

// Each criterion matches any of its values; a task must match every criterion.
export interface Criteria {
  /** `me`, `nobody`, or a user id. */
  assignee?: string[] | undefined
  priority?: number[] | undefined
  label?: string[] | undefined
  due?: Due[] | undefined
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
  const { assignee, priority, label, due } = criteria
  return and(
    assignee &&
      or(
        ...assignee.map(each =>
          each === 'nobody'
            ? notExists(
                tx
                  .select({ one: sql`1` })
                  .from(taskAssignees)
                  .where(eq(taskAssignees.taskId, tasks.id))
              )
            : assignedTo(tx, each === 'me' ? userId : each)
        )
      ),
    priority && inArray(tasks.priority, priority),
    label &&
      exists(
        tx
          .select({ one: sql`1` })
          .from(taskLabels)
          .innerJoin(labels, eq(labels.id, taskLabels.labelId))
          .where(
            and(
              eq(taskLabels.taskId, tasks.id),
              inArray(
                sql`lower(${labels.name})`,
                label.map(name => name.toLowerCase())
              )
            )
          )
      ),
    due && or(...due.map(each => dueIs(each, today)))
  )
}

export function createFilterStore(db: Db) {
  return {
    listFilters(identity: Identity) {
      return writeOrRefuse(db, identity, tx =>
        tx
          .select({
            id: savedFilters.id,
            name: savedFilters.name,
            criteria: savedFilters.criteria,
            favorite: savedFilters.favorite
          })
          .from(savedFilters)
          .orderBy(asc(savedFilters.name), asc(savedFilters.id))
      )
    },

    createFilter(identity: Identity, name: string, criteria: Criteria) {
      return writeOrRefuse(db, identity, async tx => {
        const [row] = await tx
          .insert(savedFilters)
          .values({
            organizationId: identity.organizationId,
            userId: identity.userId,
            name,
            criteria
          })
          .returning({ id: savedFilters.id })
        if (!row) throw new Error('filter insert returned nothing')
        return row
      })
    },

    // A label criterion matches any case, so names differing only by case are one.
    labelNames(identity: Identity) {
      return writeOrRefuse(db, identity, async tx => {
        const rows = await tx
          .selectDistinctOn([sql`lower(${labels.name})`], {
            name: labels.name
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
            sql`${labels.name} collate "C" desc`
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
          .orderBy(projectMembers.userId)
        return rows.sort((a, b) => a.email.localeCompare(b.email))
      })
    },

    updateFilter(
      identity: Identity,
      filterId: string,
      changes: {
        name?: string | undefined
        criteria?: Criteria | undefined
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
        return openTasksOf(
          tx,
          identity.userId,
          matching(
            tx,
            identity.userId,
            filter.criteria as Criteria,
            todayIn(zone)
          )
        )
      })
    }
  }
}
