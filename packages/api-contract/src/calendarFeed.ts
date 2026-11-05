import { z } from 'zod'

/**
 * `assigned`: the tasks assigned to the person. `mine`: also the unassigned
 * tasks of their own projects, as Today and Upcoming list them.
 */
export const calendarFeedScope = z.enum(['assigned', 'mine'])

export const calendarFeedChanges = z.strictObject({ scope: calendarFeedScope })

export const calendarFeedResponse = z.object({
  feed: z
    .object({ scope: calendarFeedScope, createdAt: z.iso.datetime() })
    .nullable()
})

// The token is kept hashed, so it is given once, when the link is made.
export const newCalendarFeed = z.object({
  scope: calendarFeedScope,
  createdAt: z.iso.datetime(),
  token: z.string()
})

export const calendarFeedParams = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/)
})
