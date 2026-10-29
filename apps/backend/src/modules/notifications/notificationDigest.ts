import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Budget } from '../../config.ts'
import type { Db, Tx } from '../../infra/db.ts'
import type { Mail } from '../../infra/mail.ts'
import { schedule, type Handler } from '../../scheduler/scheduler.ts'
import {
  APP_NAME,
  notificationEmailBudgets as budgets,
  COLORS,
  escape,
  languageOf,
  layout
} from '../boards/index.ts'
import { NOTIFICATION_MESSAGES } from './notificationMessages.ts'

export const NOTIFICATION_DIGEST_JOB = 'notification_digest'

const recipient = z.object({
  userId: z.uuid(),
  email: z.string(),
  language: z.string().nullable()
})

type Recipient = z.infer<typeof recipient>

const windowOf = (budget: Budget) =>
  sql`${`${String(budget.windowSeconds)} seconds`}::interval`

async function lockBudget(tx: Tx, userId: string, budget: Budget) {
  await tx
    .insert(budgets)
    .values({ userId, windowStart: sql`now()` })
    .onConflictDoNothing()
  const [row] = await tx
    .select({
      sent: budgets.sent,
      held: budgets.held,
      digestScheduled: budgets.digestScheduled,
      ended: sql<boolean>`${budgets.windowStart} + ${windowOf(budget)} <= now()`,
      windowEnd: sql`${budgets.windowStart} + ${windowOf(budget)}`.mapWith(
        budgets.windowStart
      )
    })
    .from(budgets)
    .where(eq(budgets.userId, userId))
    .for('update')
  if (!row) throw new Error('email budget row missing')
  return row
}

async function takeSlot(
  tx: Tx,
  userId: string,
  row: { sent: number; ended: boolean }
) {
  await tx
    .update(budgets)
    .set(
      row.ended ? { windowStart: sql`now()`, sent: 1 } : { sent: row.sent + 1 }
    )
    .where(eq(budgets.userId, userId))
}

/** Sends a mail that took a slot, and frees the slot when the send fails. */
export async function sendCounted(
  db: Db,
  userId: string,
  send: () => Promise<void>
) {
  try {
    await send()
  } catch (error) {
    await db
      .update(budgets)
      .set({ sent: sql`greatest(${budgets.sent} - 1, 0)` })
      .where(eq(budgets.userId, userId))
    throw error
  }
}

/**
 * Counts one notification email to the person against the budget. Past it,
 * the email is held, and one digest counts every held email once the window
 * ends.
 */
export async function takeEmail(
  tx: Tx,
  budget: Budget,
  to: Recipient
): Promise<boolean> {
  if (budget.max === 0) return true
  const row = await lockBudget(tx, to.userId, budget)
  if (row.ended || row.sent < budget.max) {
    await takeSlot(tx, to.userId, row)
    return true
  }
  await tx
    .update(budgets)
    .set({ held: row.held + 1, digestScheduled: true })
    .where(eq(budgets.userId, to.userId))
  if (!row.digestScheduled) {
    await schedule(tx, {
      kind: NOTIFICATION_DIGEST_JOB,
      userId: to.userId,
      payload: to,
      runAt: row.windowEnd
    })
  }
  return false
}

function digestMail(appUrl: string, to: Recipient, count: number): Mail {
  const lang = languageOf(to.language)
  const messages = NOTIFICATION_MESSAGES[lang]
  const form = new Intl.PluralRules(lang).select(count)
  const subject = (
    messages.digest.subject[form] ?? messages.digest.subject.other
  ).replace('#', String(count))
  const link = `${appUrl.replace(/\/$/, '')}/notifications`
  return {
    to: to.email,
    subject,
    text: `${messages.digest.body}\n\n${messages.all}: ${link}\n`,
    html: layout({
      lang,
      appName: APP_NAME,
      context: escape(subject),
      preheader: escape(messages.digest.body),
      body: `<p class="m-ink" style="margin:0 0 20px;font-size:15px;line-height:1.5;color:${COLORS.ink};">${escape(messages.digest.body)}</p>`,
      action: {
        label: messages.all,
        href: link,
        fallback: messages.fallback
      },
      footer: APP_NAME
    })
  }
}

// Held emails stay counted until the digest is sent, so a failed send retries
// with them, and those held meanwhile get the next digest.
export function emailDigest(deps: {
  appUrl: string
  budget: Budget
  send: (mail: Mail) => Promise<void>
}): Handler {
  return async (raw, tx) => {
    const to = recipient.parse(raw)
    const row = await lockBudget(tx, to.userId, deps.budget)
    if (row.held === 0) {
      await tx
        .update(budgets)
        .set({ digestScheduled: false })
        .where(eq(budgets.userId, to.userId))
      return undefined
    }
    if (!row.ended && row.sent >= deps.budget.max) {
      await schedule(tx, {
        kind: NOTIFICATION_DIGEST_JOB,
        userId: to.userId,
        payload: to,
        runAt: row.windowEnd
      })
      return undefined
    }
    await takeSlot(tx, to.userId, row)
    const count = row.held
    return async (db: Db) => {
      await sendCounted(db, to.userId, () =>
        deps.send(digestMail(deps.appUrl, to, count))
      )
      const [left] = await db
        .update(budgets)
        .set({
          held: sql`${budgets.held} - ${count}`,
          digestScheduled: sql`${budgets.held} > ${count}`
        })
        .where(eq(budgets.userId, to.userId))
        .returning({
          held: budgets.held,
          windowEnd:
            sql`${budgets.windowStart} + ${windowOf(deps.budget)}`.mapWith(
              budgets.windowStart
            )
        })
      if (left && left.held > 0) {
        await schedule(db, {
          kind: NOTIFICATION_DIGEST_JOB,
          userId: to.userId,
          payload: to,
          runAt: left.windowEnd
        })
      }
    }
  }
}
