import { and, asc, eq, gte, isNull, lt, sql } from 'drizzle-orm'
import { z } from 'zod'
import { asTenant, type Tx } from '../../infra/db.ts'
import type { Mail } from '../../infra/mail.ts'
import { schedule, type Handler } from '../../scheduler/scheduler.ts'
import {
  APP_NAME,
  boards,
  COLORS,
  escape,
  languageOf,
  layout,
  notifications,
  plain,
  projectMembers,
  projects,
  settingsOfMember,
  tasks
} from '../boards/index.ts'
import {
  notificationKind,
  preferencesOf,
  unsubscribeTokenOf,
  userSettings
} from '../settings/index.ts'
import { NOTIFICATION_MESSAGES } from './notificationMessages.ts'
import { preferenceLinks } from './preferenceLinks.ts'

export const NOTIFICATION_DAILY_JOB = 'notification_daily'

const payload = z.object({
  userId: z.uuid(),
  organizationId: z.string().nullable(),
  since: z.iso.datetime(),
  until: z.iso.datetime()
})

/**
 * Plans the summary that lists the notification: at the first 8:00 after it,
 * in the person's time zone, covering the day before that 8:00. Every
 * notification of that day plans the same job, under one key.
 */
export async function planDailySummary(
  tx: Tx,
  to: { userId: string; organizationId: string | null },
  createdAt: Date,
  timezone: string | null
) {
  const [day] = await tx.execute<{ since: string; until: string }>(sql`
    with zone as (
      select coalesce(
        (select min(name) from pg_timezone_names where name = ${timezone}),
        'UTC'
      ) as name
    ), local as (
      -- From now when the job runs late: the summary of that 8:00 has gone.
      select name, greatest(${createdAt.toISOString()}::timestamptz, now())
        at time zone name as at
      from zone
    ), summary as (
      select name, (at::date + case when at::time < time '08:00' then 0 else 1 end)
        + time '08:00' as at
      from local
    )
    select
      to_char((at - interval '1 day') at time zone name at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS"Z"') as since,
      to_char(at at time zone name at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS"Z"') as until
    from summary`)
  if (!day) throw new Error('no daily summary time')
  await schedule(tx, {
    kind: NOTIFICATION_DAILY_JOB,
    key: `${NOTIFICATION_DAILY_JOB}:${to.userId}:${to.organizationId ?? ''}:${day.until}`,
    userId: to.userId,
    payload: { ...to, ...day },
    runAt: new Date(day.until)
  })
}

// Runs as the person, so it lists only what they can still open and have not
// read in the app meanwhile.
export function emailDailySummary(deps: {
  appUrl: string
  send: (mail: Mail) => Promise<void>
}): Handler {
  return async (raw, tx) => {
    const job = payload.parse(raw)
    await asTenant(tx, { ...job, email: '' })
    const preferences = await preferencesOf(tx, job.userId)
    if (preferences.emailFrequency === 'never') return undefined
    const rows = (
      await tx
        .select({
          reason: notifications.reason,
          commentId: notifications.commentId,
          boardId: boards.id,
          key: sql<string>`${boards.keyPrefix} || '-' || ${tasks.number}`,
          title: tasks.title,
          project: projects.name,
          board: boards.name,
          email: projectMembers.email,
          language: userSettings.language
        })
        .from(notifications)
        .innerJoin(tasks, eq(tasks.id, notifications.taskId))
        .innerJoin(boards, eq(boards.id, tasks.boardId))
        .innerJoin(
          projects,
          and(eq(projects.id, boards.projectId), isNull(projects.deletedAt))
        )
        .innerJoin(
          projectMembers,
          and(
            eq(projectMembers.projectId, projects.id),
            eq(projectMembers.userId, job.userId)
          )
        )
        .leftJoin(userSettings, settingsOfMember)
        .where(
          and(
            eq(notifications.userId, job.userId),
            isNull(notifications.readAt),
            gte(notifications.createdAt, new Date(job.since)),
            lt(notifications.createdAt, new Date(job.until))
          )
        )
        .orderBy(asc(notifications.createdAt))
    )
      .map(row => ({
        ...row,
        kind: notificationKind(row.reason, row.commentId !== null)
      }))
      .filter(row => !preferences.mutedEmail.includes(row.kind))
    const [first] = rows
    if (!first) return undefined

    const lang = languageOf(first.language)
    const messages = NOTIFICATION_MESSAGES[lang]
    const base = deps.appUrl.replace(/\/$/, '')
    const links = preferenceLinks(
      base,
      messages,
      await unsubscribeTokenOf(tx, job.userId),
      'all'
    )
    const form = new Intl.PluralRules(lang).select(rows.length)
    const subject = (
      messages.daily.subject[form] ?? messages.daily.subject.other
    ).replace('#', String(rows.length))
    const items = rows.map(row => ({
      kind: messages.daily.kinds[row.kind],
      task: `${row.key} ${plain(row.title)}`,
      crumb: `${plain(row.project)} › ${plain(row.board)}`,
      link: `${base}/boards/${row.boardId}?task=${encodeURIComponent(row.key)}`
    }))
    const all = `${base}/notifications`

    const text = [
      messages.daily.body,
      '',
      ...items.flatMap(item => [
        `${item.kind} · ${item.task}`,
        item.crumb,
        item.link,
        ''
      ]),
      `${messages.all}: ${all}`,
      ...links.text,
      ''
    ].join('\n')
    const html = layout({
      lang,
      appName: APP_NAME,
      context: escape(subject),
      preheader: escape(messages.daily.body),
      body: [
        `<p class="m-ink" style="margin:0 0 16px;font-size:15px;line-height:1.5;color:${COLORS.ink};">${escape(messages.daily.body)}</p>`,
        ...items.map(
          item =>
            `<p style="margin:0 0 14px;font-size:14px;line-height:1.4;"><span class="m-muted" style="font-size:12px;color:${COLORS.muted};">${escape(item.kind)} &middot; ${escape(item.crumb)}</span><br><a href="${escape(item.link)}" class="m-ink" style="color:${COLORS.ink};font-weight:600;text-decoration:none;">${escape(item.task)}</a></p>`
        )
      ].join('\n'),
      action: { label: messages.all, href: all, fallback: messages.fallback },
      footer: `${APP_NAME}<br>${links.html}`
    })
    return () =>
      deps.send({
        to: first.email,
        subject,
        text,
        html,
        headers: links.headers
      })
  }
}
