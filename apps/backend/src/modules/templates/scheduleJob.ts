import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import { generateKeyBetween } from 'fractional-indexing'
import { z } from 'zod'
import { asTenant, type Tx } from '../../infra/db.ts'
import {
  schedule,
  unschedule,
  type Handler
} from '../../scheduler/scheduler.ts'
import { jobs } from '../../scheduler/schema.ts'
import {
  boards,
  bumpBoards,
  inSection,
  roleIn,
  sections,
  taskAssignees,
  taskLabels,
  tasks,
  taskTemplateAssignees,
  taskTemplateLabels,
  taskTemplates,
  templateSchedules
} from '../boards/index.ts'
import { archiveTree, insertTask, plainText } from '../tasks/index.ts'
import { dueOf, nextRun, type Cadence } from './cadence.ts'

export const TEMPLATE_SCHEDULE_JOB = 'template_schedule'

const payload = z.object({
  templateId: z.uuid(),
  organizationId: z.string().nullable(),
  /** The template's author, whom the tasks are made by. */
  userId: z.uuid()
})

type Payload = z.infer<typeof payload>

const scheduleKey = (templateId: string) =>
  `${TEMPLATE_SCHEDULE_JOB}:${templateId}`

export const dropRun = (tx: Tx, templateId: string) =>
  unschedule(tx, scheduleKey(templateId))

export async function planRun(tx: Tx, job: Payload, at: Date | null) {
  if (at === null) {
    await dropRun(tx, job.templateId)
    return
  }
  await schedule(tx, {
    kind: TEMPLATE_SCHEDULE_JOB,
    key: scheduleKey(job.templateId),
    payload: job,
    runAt: at
  })
}

/**
 * Locks the schedule's job before the schedule, in the order its run takes
 * them, so an edit and a run wait for each other rather than deadlock.
 */
export async function lockRun(tx: Tx, templateId: string) {
  await tx
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.key, scheduleKey(templateId)))
    .for('update')
}

export const cadenceOf = (row: typeof templateSchedules.$inferSelect) =>
  ({
    rule: row.rule,
    time: row.time.slice(0, 5),
    zone: row.zone,
    workingDays: row.workingDays,
    startsOn: row.startsOn,
    endsOn: row.endsOn
  }) satisfies Cadence

// The board's first open section, else its first one, as for a new task.
async function landingSection(tx: Tx, boardId: string) {
  const rows = await tx
    .select({ id: sections.id, category: sections.category })
    .from(sections)
    .where(eq(sections.boardId, boardId))
    .orderBy(asc(sections.position))
  return (rows.find(row => row.category === 'unstarted') ?? rows[0])?.id ?? null
}

async function pausedBy(
  tx: Tx,
  template: { projectId: string; createdBy: string },
  boardId: string
) {
  const role = await roleIn(tx, template.createdBy, template.projectId)
  if (role === null || role === 'viewer') return 'author'
  const [board] = await tx
    .select({ id: boards.id })
    .from(boards)
    .where(
      and(
        eq(boards.id, boardId),
        eq(boards.projectId, template.projectId),
        isNull(boards.archivedAt)
      )
    )
  return board ? null : 'board'
}

// The open tasks of earlier runs move to their board's canceled section. A
// task on a board without sections is canceled where it is, and one on a
// board with no canceled section is archived. An archived board stays as it
// was.
async function closePrevious(tx: Tx, templateId: string) {
  const open = await tx
    .select({ id: tasks.id, boardId: tasks.boardId })
    .from(tasks)
    .innerJoin(boards, eq(boards.id, tasks.boardId))
    .where(
      and(
        eq(tasks.templateId, templateId),
        isNull(boards.archivedAt),
        isNotNull(tasks.scheduledFor),
        isNull(tasks.completedAt),
        isNull(tasks.canceledAt),
        isNull(tasks.archivedAt),
        isNull(tasks.deletedAt)
      )
    )
  if (open.length === 0) return
  const boardIds = [...new Set(open.map(task => task.boardId))]
  await bumpBoards(tx, inArray(boards.id, boardIds))
  const onBoards = await tx
    .select({
      id: sections.id,
      boardId: sections.boardId,
      category: sections.category
    })
    .from(sections)
    .where(inArray(sections.boardId, boardIds))
    .orderBy(asc(sections.position))
  for (const task of open) {
    const own = onBoards.filter(section => section.boardId === task.boardId)
    const canceled = own.find(section => section.category === 'canceled')
    if (!canceled && own.length > 0) {
      await archiveTree(tx, task.id)
      continue
    }
    if (!canceled) {
      await tx
        .update(tasks)
        .set({ canceledAt: new Date() })
        .where(eq(tasks.id, task.id))
      continue
    }
    const sectionId = canceled.id
    const [last] = await tx
      .select({ position: tasks.position })
      .from(tasks)
      .where(inSection(task.boardId, sectionId))
      .orderBy(desc(tasks.position))
      .limit(1)
    await tx
      .update(tasks)
      .set({
        sectionId,
        position: generateKeyBetween(last?.position ?? null, null),
        canceledAt: new Date()
      })
      .where(eq(tasks.id, task.id))
  }
}

async function addOccurrence(
  tx: Tx,
  template: typeof taskTemplates.$inferSelect,
  plan: typeof templateSchedules.$inferSelect,
  scheduledFor: Date
) {
  if (plan.previous === 'overwrite') await closePrevious(tx, template.id)
  const { boardId } = plan
  const task = await insertTask(
    tx,
    template.createdBy,
    boardId,
    {
      title: template.title,
      sectionId: await landingSection(tx, boardId),
      templateId: template.id
    },
    {
      description: template.description,
      descriptionText: plainText(template.description),
      priority: template.priority,
      scheduledFor,
      ...(plan.due && dueOf(plan.due, scheduledFor, plan.zone))
    }
  )
  const own = { taskId: task.id, organizationId: template.organizationId }
  const labelRows = await tx
    .select({ labelId: taskTemplateLabels.labelId })
    .from(taskTemplateLabels)
    .where(eq(taskTemplateLabels.templateId, template.id))
  if (labelRows.length > 0) {
    await tx
      .insert(taskLabels)
      .values(labelRows.map(row => ({ ...own, ...row })))
  }
  const assigneeRows = await tx
    .select({ userId: taskTemplateAssignees.userId })
    .from(taskTemplateAssignees)
    .where(eq(taskTemplateAssignees.templateId, template.id))
  if (assigneeRows.length > 0) {
    await tx
      .insert(taskAssignees)
      .values(assigneeRows.map(row => ({ ...own, ...row })))
  }
}

/**
 * Makes the task of the run due, as the template's author, then waits for
 * the next run after now: a schedule that missed runs makes one task, not
 * one per run missed. The job's row lock keeps other replicas off the run,
 * and the unique run per template would refuse a second task anyway.
 */
export function runSchedule(now: () => Date = () => new Date()): Handler {
  return async (raw, tx) => {
    const job = payload.parse(raw)
    await asTenant(tx, { ...job, email: '' })
    const [row] = await tx
      .select({ schedule: templateSchedules, template: taskTemplates })
      .from(templateSchedules)
      .innerJoin(
        taskTemplates,
        eq(taskTemplates.id, templateSchedules.templateId)
      )
      .where(eq(templateSchedules.templateId, job.templateId))
      .for('update', { of: templateSchedules })
    const due = row?.schedule.nextRunAt
    if (!row || row.schedule.paused || !due) return undefined
    const { schedule: plan, template } = row
    const author = { ...job, userId: template.createdBy }
    const at = now()
    if (due > at) {
      await planRun(tx, author, due)
      return 'keep'
    }
    const stopped = await pausedBy(tx, template, plan.boardId)
    if (stopped) {
      await tx
        .update(templateSchedules)
        .set({ paused: true, pausedBy: stopped, nextRunAt: null })
        .where(eq(templateSchedules.templateId, template.id))
      return undefined
    }
    const [made] = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(eq(tasks.templateId, template.id), eq(tasks.scheduledFor, due))
      )
    if (!made) await addOccurrence(tx, template, plan, due)
    const next = nextRun(cadenceOf(plan), at)
    await tx
      .update(templateSchedules)
      .set({ nextRunAt: next })
      .where(eq(templateSchedules.templateId, template.id))
    if (next === null) return undefined
    await planRun(tx, author, next)
    return 'keep'
  }
}
