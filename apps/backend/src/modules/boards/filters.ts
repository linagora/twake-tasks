import {
  and,
  asc,
  eq,
  exists,
  gte,
  isNull,
  lt,
  notExists,
  sql
} from 'drizzle-orm'
import type { Db, Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
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

export interface Criteria {
  assignee?: 'me' | 'nobody' | undefined
  priority?: number | undefined
  label?: string | undefined
  due?: 'overdue' | 'today' | 'week' | 'none' | undefined
}

function matching(tx: Tx, userId: string, criteria: Criteria, today: string) {
  const { assignee, priority, label, due } = criteria
  return and(
    assignee === 'me' ? assignedTo(tx, userId) : undefined,
    assignee === 'nobody'
      ? notExists(
          tx
            .select({ one: sql`1` })
            .from(taskAssignees)
            .where(eq(taskAssignees.taskId, tasks.id))
        )
      : undefined,
    priority === undefined ? undefined : eq(tasks.priority, priority),
    label === undefined
      ? undefined
      : exists(
          tx
            .select({ one: sql`1` })
            .from(taskLabels)
            .innerJoin(labels, eq(labels.id, taskLabels.labelId))
            .where(
              and(
                eq(taskLabels.taskId, tasks.id),
                eq(sql`lower(${labels.name})`, label.toLowerCase())
              )
            )
        ),
    due === 'overdue' ? lt(tasks.dueDate, today) : undefined,
    due === 'today' ? eq(tasks.dueDate, today) : undefined,
    due === 'week'
      ? and(
          gte(tasks.dueDate, today),
          lt(tasks.dueDate, shift(today, 7, 'days'))
        )
      : undefined,
    due === 'none' ? isNull(tasks.dueDate) : undefined
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
            criteria: savedFilters.criteria
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
