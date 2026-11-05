import { createHash, randomBytes } from 'node:crypto'
import { and, eq, isNotNull } from 'drizzle-orm'
import { inTenant, type Db } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { APP_NAME, tasks } from '../boards/index.ts'
import { calendarOf, type FeedTask } from './icalendar.ts'
import { calendarFeeds } from './schema.ts'
import { assignedTo, mine, openTasksOf } from './store.ts'

type Scope = (typeof calendarFeeds.$inferSelect)['scope']

const hashOf = (token: string) =>
  createHash('sha256').update(token).digest('hex')

const shown = { scope: calendarFeeds.scope, createdAt: calendarFeeds.createdAt }

export function createCalendarFeeds(db: Db, appUrl: string) {
  return {
    async feedOf(identity: Identity) {
      const [feed] = await db
        .select(shown)
        .from(calendarFeeds)
        .where(eq(calendarFeeds.userId, identity.userId))
      return feed ?? null
    },

    /** A new link, which ends the one before. */
    async open(identity: Identity, scope: Scope) {
      const token = randomBytes(32).toString('hex')
      const values = {
        organizationId: identity.organizationId,
        email: identity.email,
        tokenHash: hashOf(token),
        scope,
        createdAt: new Date()
      }
      const [feed] = await db
        .insert(calendarFeeds)
        .values({ userId: identity.userId, ...values })
        .onConflictDoUpdate({ target: calendarFeeds.userId, set: values })
        .returning(shown)
      if (!feed) throw new Error('no calendar feed')
      return { ...feed, token }
    },

    async change(identity: Identity, scope: Scope) {
      const [feed] = await db
        .update(calendarFeeds)
        .set({ scope })
        .where(eq(calendarFeeds.userId, identity.userId))
        .returning(shown)
      return feed ?? null
    },

    async close(identity: Identity) {
      await db
        .delete(calendarFeeds)
        .where(eq(calendarFeeds.userId, identity.userId))
    },

    /** The feed's iCalendar, read as its owner, or null for an unknown token. */
    async calendar(token: string) {
      const [feed] = await db
        .select()
        .from(calendarFeeds)
        .where(eq(calendarFeeds.tokenHash, hashOf(token)))
      if (!feed) return null
      const owner = {
        organizationId: feed.organizationId,
        userId: feed.userId,
        email: feed.email
      }
      const found = await inTenant(db, owner, tx =>
        openTasksOf(
          tx,
          feed.userId,
          and(
            isNotNull(tasks.dueDate),
            feed.scope === 'mine'
              ? mine(tx, feed.userId)
              : assignedTo(tx, feed.userId)
          )
        )
      )
      return calendarOf(
        found.filter(
          (task): task is typeof task & FeedTask =>
            task.id !== undefined && typeof task.dueDate === 'string'
        ),
        { appUrl, name: APP_NAME, now: new Date() }
      )
    }
  }
}
