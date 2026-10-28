import { z } from 'zod'
import { instant } from './common.ts'
import { historyEntry } from './history.ts'
import { person } from './people.ts'

export const notification = z.object({
  id: z.string(),
  reason: z.enum([
    'assigned',
    'unassigned',
    'mentioned',
    'following',
    'reminder'
  ]),
  boardId: z.string(),
  boardName: z.string(),
  taskId: z.string(),
  key: z.string(),
  title: z.string(),
  createdAt: instant,
  readAt: instant.nullable(),
  actor: person.nullable(),
  change: historyEntry.extend({ actor: person }).nullable(),
  commentExcerpt: z.string().nullable()
})

export const notificationParams = z.object({ notificationId: z.uuid() })

/**
 * Without `ids`, every notification. With them, only those, so one received
 * after the list was shown stays unread.
 */
export const notificationsRead = z
  .strictObject({ ids: z.array(z.uuid()).max(50).optional() })
  .optional()

export const notificationsResponse = z.object({
  notifications: z.array(notification)
})

export const unreadResponse = z.object({
  projects: z.array(z.object({ projectId: z.string(), count: z.number() }))
})
