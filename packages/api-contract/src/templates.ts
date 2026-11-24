import { z } from 'zod'
import { instant, isTimeZone } from './common.ts'
import { taskTitle } from './tasks.ts'

export const projectParams = z.object({ projectId: z.uuid() })

export const projectTemplateParams = z.object({
  projectId: z.uuid(),
  templateId: z.uuid()
})

/** 1 is Monday, 7 Sunday. */
const weekday = z.int().min(1).max(7)

// February 29 runs on the 28th outside leap years, and so does any day a
// month is too short for.
export const scheduleRule = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('daily'), every: z.int().min(1).max(365) }),
  z.strictObject({
    kind: z.literal('weekly'),
    every: z.int().min(1).max(52),
    weekdays: z.array(weekday).min(1).max(7)
  }),
  z.strictObject({
    kind: z.literal('monthly'),
    every: z.int().min(1).max(12),
    day: z.union([z.int().min(1).max(31), z.literal('last')])
  }),
  z
    .strictObject({
      kind: z.literal('yearly'),
      month: z.int().min(1).max(12),
      day: z.int().min(1).max(31)
    })
    .refine(
      ({ month, day }) => day <= new Date(Date.UTC(2000, month, 0)).getUTCDate()
    )
])

export type ScheduleRule = z.infer<typeof scheduleRule>

const wallTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

/**
 * When a run's task is due, counted from the day the run was planned for,
 * in the schedule's zone: N days later, day D of that month or of N months
 * later, or the last day of that quarter or of N quarters later. Without a
 * `time`, the task is due all day.
 */
export const dueRule = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('days'),
    after: z.int().min(0).max(365),
    time: wallTime.nullable()
  }),
  z.strictObject({
    kind: z.literal('monthDay'),
    after: z.int().min(0).max(12),
    day: z.union([z.int().min(1).max(31), z.literal('last')]),
    time: wallTime.nullable()
  }),
  z.strictObject({
    kind: z.literal('quarterEnd'),
    after: z.int().min(0).max(4),
    time: wallTime.nullable()
  })
])

export type DueRule = z.infer<typeof dueRule>

/**
 * `zone` is the browser's, used when the person's settings name none.
 * With `workingDays`, daily counts Monday to Friday only, weekly drops the
 * weekend, and monthly and yearly runs move to the working day before.
 * With `previous` set to overwrite, a run cancels the open tasks of earlier
 * runs.
 */
export const scheduleFields = z.strictObject({
  boardId: z.uuid(),
  rule: scheduleRule,
  time: wallTime,
  zone: z.string().max(64).refine(isTimeZone),
  workingDays: z.boolean(),
  endsOn: z.iso.date().nullable(),
  paused: z.boolean(),
  due: dueRule.nullable().default(null),
  previous: z.enum(['keep', 'overwrite']).default('keep')
})

// Left out, an edit keeps the schedule as it is.
export const templateFields = z.strictObject({
  title: taskTitle,
  description: z.string().max(50_000),
  priority: z.int().min(1).max(4).nullable(),
  labelIds: z.array(z.uuid()).max(50),
  assigneeIds: z.array(z.uuid()).max(50),
  schedule: scheduleFields.nullable().optional()
})

/**
 * `pausedBy` says why the schedule stopped by itself: its author can no
 * longer add tasks, or its board was archived or left the project. Saving it
 * again resumes it. Without a next run, an unpaused schedule has ended.
 */
export const templateSchedule = scheduleFields.extend({
  pausedBy: z.enum(['author', 'board']).nullable(),
  nextRunAt: instant.nullable()
})

export const template = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  description: z.string(),
  priority: z.literal([1, 2, 3, 4]).nullable(),
  labelIds: z.array(z.string()),
  assigneeIds: z.array(z.string()),
  schedule: templateSchedule.nullable()
})

export const templatesResponse = z.object({ templates: z.array(template) })
