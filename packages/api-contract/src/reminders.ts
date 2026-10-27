import { z } from 'zod'
import { isTimeZone } from './common.ts'
import { taskParams } from './tasks.ts'

export const newReminder = z.union([
  z.strictObject({
    at: z.iso.datetime({ offset: true }).pipe(z.coerce.date())
  }),
  z.strictObject({
    beforeMinutes: z
      .int()
      .min(0)
      .max(60 * 24 * 365),
    zone: z.string().max(64).refine(isTimeZone)
  })
])

export const reminderParams = taskParams.extend({ reminderId: z.uuid() })
