import { forgetProcessedEvents } from './events/dedupe.ts'
import { forgetSentEvents } from './events/outbox.ts'
import { forgetRevokedSessions } from './modules/auth/index.ts'
import { forgetReadNotifications } from './modules/boards/index.ts'
import { schedule, type Handler } from './scheduler/scheduler.ts'

export const RETENTION_JOB = 'retention'

const DAY_MS = 24 * 60 * 60 * 1000

export interface Retention {
  processedEventsDays: number
  readNotificationsDays: number
  revokedSessionsDays: number
}

export function retention(
  keep: Retention,
  now: () => Date = () => new Date()
): Handler {
  return async (_payload, tx) => {
    const at = now().getTime()
    const daysAgo = (days: number) => new Date(at - days * DAY_MS)
    await forgetProcessedEvents(tx, daysAgo(keep.processedEventsDays))
    await forgetSentEvents(tx, daysAgo(1))
    await forgetReadNotifications(tx, daysAgo(keep.readNotificationsDays))
    await forgetRevokedSessions(tx, daysAgo(keep.revokedSessionsDays))
    await schedule(tx, {
      kind: RETENTION_JOB,
      key: RETENTION_JOB,
      payload: {},
      runAt: new Date(at + DAY_MS)
    })
    return 'keep'
  }
}
