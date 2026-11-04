import { z } from 'zod'

export const settingsResponse = z.object({
  language: z.string().nullable(),
  timezone: z.string().nullable(),
  theme: z.enum(['light', 'dark', 'auto']),
  avatar: z.string().nullable(),
  name: z.string().nullable()
})

export const notificationKind = z.enum([
  'assigned',
  'mentioned',
  'reminder',
  'changes',
  'comments'
])

export type NotificationKind = z.infer<typeof notificationKind>

export const notificationPreferences = z.strictObject({
  mutedInApp: z.array(notificationKind).max(5),
  mutedEmail: z.array(notificationKind).max(5),
  emailFrequency: z.enum(['instant', 'daily', 'never'])
})

/** From the link of an email, without a session: `all` stops every email. */
export const unsubscribeQuery = z.object({
  token: z.uuid(),
  kind: z.union([notificationKind, z.literal('all')])
})
