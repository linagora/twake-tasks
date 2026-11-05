import { isDeepStrictEqual } from 'node:util'
import type { ScheduleRule } from '@twake-tasks/api-contract'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Db, Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import {
  boards,
  bumpBoards,
  labels,
  projectMembers,
  projects,
  roleIn,
  tasks,
  taskTemplateAssignees,
  taskTemplateLabels,
  taskTemplates,
  templateSchedules
} from '../boards/index.ts'
import { Refused, writeOrRefuse } from '../kernel/index.ts'
import { userSettings } from '../settings/index.ts'
import { dayIn, nextRun, type Cadence } from './cadence.ts'
import { cadenceOf, dropRun, lockRun, planRun } from './scheduleJob.ts'

interface ScheduleFields {
  boardId: string
  rule: ScheduleRule
  time: string
  zone: string
  workingDays: boolean
  endsOn: string | null
  paused: boolean
}

export interface TemplateFields {
  title: string
  description: string
  priority: number | null
  labelIds: string[]
  assigneeIds: string[]
  schedule?: ScheduleFields | null | undefined
}

const inProject = (projectId: string, templateId: string) =>
  and(eq(taskTemplates.id, templateId), eq(taskTemplates.projectId, projectId))

// An author who can no longer add tasks pauses the schedule, even before its
// next run finds out.
function scheduleOf(
  row: typeof templateSchedules.$inferSelect,
  authorRole: string | null
) {
  const pausedBy =
    row.pausedBy ??
    (authorRole === null || authorRole === 'viewer' ? 'author' : null)
  return {
    boardId: row.boardId,
    rule: row.rule,
    time: row.time.slice(0, 5),
    zone: row.zone,
    workingDays: row.workingDays,
    endsOn: row.endsOn,
    paused: row.paused || pausedBy !== null,
    pausedBy,
    nextRunAt: pausedBy === null ? (row.nextRunAt?.toISOString() ?? null) : null
  }
}

// The templates of every project the person is a member of.
async function templatesOf(tx: Tx, userId: string, templateId?: string) {
  const author = alias(projectMembers, 'author')
  const rows = await tx
    .select({
      id: taskTemplates.id,
      projectId: taskTemplates.projectId,
      title: taskTemplates.title,
      description: taskTemplates.description,
      priority: taskTemplates.priority,
      schedule: templateSchedules,
      authorRole: author.role
    })
    .from(taskTemplates)
    .innerJoin(
      projects,
      and(eq(projects.id, taskTemplates.projectId), isNull(projects.deletedAt))
    )
    .innerJoin(
      projectMembers,
      and(
        eq(projectMembers.projectId, projects.id),
        eq(projectMembers.userId, userId)
      )
    )
    .leftJoin(
      templateSchedules,
      eq(templateSchedules.templateId, taskTemplates.id)
    )
    .leftJoin(
      author,
      and(
        eq(author.projectId, taskTemplates.projectId),
        eq(author.userId, taskTemplates.createdBy)
      )
    )
    .where(
      templateId === undefined ? undefined : eq(taskTemplates.id, templateId)
    )
    .orderBy(asc(taskTemplates.title), asc(taskTemplates.id))
  if (rows.length === 0) return []
  const ids = rows.map(row => row.id)
  const labelRows = await tx
    .select()
    .from(taskTemplateLabels)
    .where(inArray(taskTemplateLabels.templateId, ids))
  const assigneeRows = await tx
    .select()
    .from(taskTemplateAssignees)
    .where(inArray(taskTemplateAssignees.templateId, ids))
  return rows.map(({ schedule, authorRole, ...row }) => ({
    ...row,
    priority: row.priority as 1 | 2 | 3 | 4 | null,
    schedule: schedule && scheduleOf(schedule, authorRole),
    labelIds: labelRows
      .filter(label => label.templateId === row.id)
      .map(label => label.labelId),
    assigneeIds: assigneeRows
      .filter(assignee => assignee.templateId === row.id)
      .map(assignee => assignee.userId)
  }))
}

// Their tasks show the template's title, or lose it with the template.
const bumpBoardsUsing = (tx: Tx, templateId: string) =>
  bumpBoards(
    tx,
    inArray(
      boards.id,
      tx
        .selectDistinct({ id: tasks.boardId })
        .from(tasks)
        .where(eq(tasks.templateId, templateId))
    )
  )

async function checkEditor(tx: Tx, identity: Identity, projectId: string) {
  const role = await roleIn(tx, identity.userId, projectId)
  if (!role) throw new Refused('not_found')
  if (role === 'viewer') throw new Refused('forbidden')
}

// Labels and assignees belong to the project, as on its tasks.
async function checkProjectFields(
  tx: Tx,
  projectId: string,
  fields: TemplateFields
) {
  const labelIds = [...new Set(fields.labelIds)]
  if (labelIds.length > 0) {
    const found = await tx
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.projectId, projectId), inArray(labels.id, labelIds)))
    if (found.length !== labelIds.length) throw new Refused('invalid_label')
  }
  const assigneeIds = [...new Set(fields.assigneeIds)]
  if (assigneeIds.length > 0) {
    const found = await tx
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          inArray(projectMembers.userId, assigneeIds)
        )
      )
    if (found.length !== assigneeIds.length) {
      throw new Refused('invalid_assignee')
    }
  }
  return { labelIds, assigneeIds }
}

function knownZone(zone: string | null | undefined): string | null {
  if (!zone) return null
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return zone
  } catch {
    return null
  }
}

// The zone of the person's settings, else of their browser.
async function zoneOf(tx: Tx, identity: Identity, browserZone: string) {
  const [settings] = await tx
    .select({ timezone: userSettings.timezone })
    .from(userSettings)
    .where(eq(userSettings.email, identity.email.toLowerCase()))
  return knownZone(settings?.timezone) ?? browserZone
}

const ruleOf = (rule: ScheduleRule): ScheduleRule =>
  rule.kind === 'weekly'
    ? { ...rule, weekdays: [...new Set(rule.weekdays)].sort((a, b) => a - b) }
    : rule

// An unchanged schedule keeps its next run, so saving the template's other
// fields never makes or skips a run. A changed one counts from today.
async function saveSchedule(
  tx: Tx,
  identity: Identity,
  template: { id: string; projectId: string; createdBy: string },
  fields: ScheduleFields | null
) {
  const now = new Date()
  const [current] = await tx
    .select()
    .from(templateSchedules)
    .where(eq(templateSchedules.templateId, template.id))
    .for('update')
  if (fields === null) {
    await dropRun(tx, template.id)
    await tx
      .delete(templateSchedules)
      .where(eq(templateSchedules.templateId, template.id))
    return
  }
  const [board] = await tx
    .select({ archivedAt: boards.archivedAt })
    .from(boards)
    .where(
      and(
        eq(boards.id, fields.boardId),
        eq(boards.projectId, template.projectId)
      )
    )
  if (!board) throw new Refused('not_found')
  if (board.archivedAt) throw new Refused('archived')
  const zone = await zoneOf(tx, identity, fields.zone)
  const cadence: Cadence = {
    rule: ruleOf(fields.rule),
    time: fields.time,
    zone,
    workingDays: fields.workingDays,
    startsOn: dayIn(zone, now),
    endsOn: fields.endsOn
  }
  const unchanged =
    current !== undefined &&
    current.boardId === fields.boardId &&
    isDeepStrictEqual(
      { ...cadenceOf(current), startsOn: null },
      { ...cadence, startsOn: null }
    )
  if (unchanged) cadence.startsOn = current.startsOn
  let author = template.createdBy
  if (!fields.paused) {
    // Whoever resumes a schedule its author can no longer run takes it over.
    const role = await roleIn(tx, author, template.projectId)
    if (role === null || role === 'viewer') {
      author = identity.userId
      await tx
        .update(taskTemplates)
        .set({ createdBy: author })
        .where(eq(taskTemplates.id, template.id))
    }
  }
  const nextRunAt = fields.paused
    ? null
    : unchanged &&
        !current.paused &&
        current.nextRunAt !== null &&
        current.nextRunAt > now
      ? current.nextRunAt
      : nextRun(cadence, now)
  const values = {
    boardId: fields.boardId,
    ...cadence,
    paused: fields.paused,
    pausedBy: null,
    nextRunAt
  }
  await tx
    .insert(templateSchedules)
    .values({
      ...values,
      templateId: template.id,
      organizationId: identity.organizationId
    })
    .onConflictDoUpdate({ target: templateSchedules.templateId, set: values })
  await planRun(
    tx,
    {
      templateId: template.id,
      organizationId: identity.organizationId,
      userId: author
    },
    nextRunAt
  )
}

export function createTemplateStore(db: Db) {
  const write = <T>(identity: Identity, work: (tx: Tx) => Promise<T>) =>
    writeOrRefuse(db, identity, work)

  async function save(
    tx: Tx,
    identity: Identity,
    projectId: string,
    fields: TemplateFields,
    templateId?: string
  ) {
    if (templateId !== undefined) await lockRun(tx, templateId)
    const values = {
      title: fields.title,
      description: fields.description,
      priority: fields.priority
    }
    const [saved] =
      templateId === undefined
        ? await tx
            .insert(taskTemplates)
            .values({
              ...values,
              projectId,
              organizationId: identity.organizationId,
              createdBy: identity.userId
            })
            .returning({
              id: taskTemplates.id,
              createdBy: taskTemplates.createdBy
            })
        : await tx
            .update(taskTemplates)
            .set(values)
            .where(inProject(projectId, templateId))
            .returning({
              id: taskTemplates.id,
              createdBy: taskTemplates.createdBy
            })
    if (!saved) throw new Refused('not_found')
    if (templateId !== undefined) await bumpBoardsUsing(tx, templateId)
    const { labelIds, assigneeIds } = await checkProjectFields(
      tx,
      projectId,
      fields
    )
    const { organizationId } = identity
    await tx
      .delete(taskTemplateLabels)
      .where(eq(taskTemplateLabels.templateId, saved.id))
    await tx
      .delete(taskTemplateAssignees)
      .where(eq(taskTemplateAssignees.templateId, saved.id))
    if (labelIds.length > 0) {
      await tx.insert(taskTemplateLabels).values(
        labelIds.map(labelId => ({
          templateId: saved.id,
          labelId,
          organizationId
        }))
      )
    }
    if (assigneeIds.length > 0) {
      await tx.insert(taskTemplateAssignees).values(
        assigneeIds.map(userId => ({
          templateId: saved.id,
          userId,
          organizationId
        }))
      )
    }
    if (fields.schedule !== undefined) {
      await saveSchedule(tx, identity, { ...saved, projectId }, fields.schedule)
    }
    const [template] = await templatesOf(tx, identity.userId, saved.id)
    if (!template) throw new Error('saved template is gone')
    return template
  }

  async function remove(tx: Tx, projectId: string, templateId: string) {
    await lockRun(tx, templateId)
    await bumpBoardsUsing(tx, templateId)
    const deleted = await tx
      .delete(taskTemplates)
      .where(inProject(projectId, templateId))
      .returning({ id: taskTemplates.id })
    if (deleted.length === 0) throw new Refused('not_found')
    await dropRun(tx, templateId)
    return null
  }

  return {
    listTemplates(identity: Identity) {
      return write(identity, tx => templatesOf(tx, identity.userId))
    },

    createProjectTemplate(
      identity: Identity,
      projectId: string,
      fields: TemplateFields
    ) {
      return write(identity, async tx => {
        await checkEditor(tx, identity, projectId)
        return save(tx, identity, projectId, fields)
      })
    },

    editProjectTemplate(
      identity: Identity,
      projectId: string,
      templateId: string,
      fields: TemplateFields
    ) {
      return write(identity, async tx => {
        await checkEditor(tx, identity, projectId)
        return save(tx, identity, projectId, fields, templateId)
      })
    },

    deleteProjectTemplate(
      identity: Identity,
      projectId: string,
      templateId: string
    ) {
      return write(identity, async tx => {
        await checkEditor(tx, identity, projectId)
        return remove(tx, projectId, templateId)
      })
    }
  }
}
