import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { asTenant, type Tx } from '../../infra/db.ts'
import type { Handler } from '../../scheduler/scheduler.ts'
import { userSettings } from '../settings/schema.ts'
import { memberLooks, settingsOfMember } from './access.ts'
import {
  APP_NAME,
  COLORS,
  escape,
  languageOf,
  layout,
  plain,
  type Language
} from './mailLayout.ts'
import { plainText } from './markdown.ts'
import {
  NOTIFICATION_MESSAGES,
  type NotificationMessages,
  type Why
} from './notificationMessages.ts'
import {
  boards,
  comments,
  labels,
  notifications,
  projectMembers,
  projects,
  sections,
  taskHistory,
  tasks
} from './schema.ts'

export const NOTIFICATION_EMAIL_JOB = 'notification_email'

export interface Mail {
  to: string
  subject: string
  text: string
  html: string
}

const payload = z.object({
  notificationId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.string().nullable()
})

const QUOTE_LENGTH = 400
const PRIORITY_COLORS: Record<number, string> = {
  1: '#d93025',
  2: '#e8710a',
  3: '#1a73e8',
  4: '#8a94a3'
}
const AVATAR_COLORS = ['#7c5cff', '#0f9d76', '#e8710a', '#d6336c', '#1a73e8']

const isDay = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

function formatDay(lang: Language, day: string): string {
  return new Intl.DateTimeFormat(lang, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC'
  }).format(new Date(`${day}T00:00:00Z`))
}

function formatInstant(lang: Language, at: Date, zone: string): string {
  let timeZone = zone
  try {
    new Intl.DateTimeFormat('en', { timeZone })
  } catch {
    timeZone = 'UTC'
  }
  return new Intl.DateTimeFormat(lang, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone
  }).format(at)
}

function initials(name: string): string {
  const words = name.split(/[\s@._-]+/).filter(Boolean)
  return (
    words
      .slice(0, 2)
      .map(word => Array.from(word)[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

function colorOf(seed: string): string {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? COLORS.brand
}

async function nameOf(
  tx: Tx,
  projectId: string,
  userId: string | null
): Promise<{ name: string; email: string } | undefined> {
  if (!userId) return undefined
  const [member] = await tx
    .select({ email: projectMembers.email, name: memberLooks.name })
    .from(projectMembers)
    .leftJoin(userSettings, settingsOfMember)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId)
      )
    )
  return member && { name: member.name || member.email, email: member.email }
}

const MENTION = /(^|\s)@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]*[A-Za-z0-9])/g

// A mention reads as the person's name, as it does in the app.
async function withNames(
  tx: Tx,
  projectId: string,
  text: string
): Promise<string> {
  const emails = [...text.matchAll(MENTION)].map(match =>
    (match[2] ?? '').toLowerCase()
  )
  if (emails.length === 0) return text
  const members = await tx
    .select({ email: projectMembers.email, name: memberLooks.name })
    .from(projectMembers)
    .leftJoin(userSettings, settingsOfMember)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        inArray(sql`lower(${projectMembers.email})`, emails)
      )
    )
  const names = new Map(
    members.map(member => [member.email.toLowerCase(), member.name])
  )
  return text.replace(MENTION, (mention, space: string, email: string) => {
    const name = names.get(email.toLowerCase())
    return name ? `${space}@${plain(name)}` : mention
  })
}

async function describe(
  tx: Tx,
  row: { projectId: string; boardId: string },
  entry: { field: string; from: unknown; to: unknown } | null,
  messages: NotificationMessages,
  lang: Language,
  actor: string
): Promise<string> {
  if (!entry) return messages.updated(actor)
  const value = entry.to ?? entry.from
  const id = typeof value === 'string' ? value : null
  switch (entry.field) {
    case 'title':
      return messages.renamed(actor)
    case 'priority':
      return messages.priority(
        actor,
        typeof entry.to === 'number' ? `P${String(entry.to)}` : null
      )
    case 'dueDate':
      return messages.dueDate(
        actor,
        isDay(entry.to) ? formatDay(lang, entry.to) : null
      )
    case 'deadline':
      return messages.deadline(
        actor,
        isDay(entry.to) ? formatDay(lang, entry.to) : null
      )
    case 'section': {
      if (typeof entry.to !== 'string') return messages.section(actor, null)
      const [section] = await tx
        .select({ name: sections.name })
        .from(sections)
        .where(
          and(eq(sections.id, entry.to), eq(sections.boardId, row.boardId))
        )
      return messages.section(actor, section ? plain(section.name) : null)
    }
    case 'completion':
      return entry.to === 'completed'
        ? messages.completed(actor)
        : entry.to === 'canceled'
          ? messages.canceled(actor)
          : messages.reopened(actor)
    case 'assignees': {
      const person = await nameOf(tx, row.projectId, id)
      const name = plain(person?.name ?? messages.someone)
      return entry.to !== null
        ? messages.assigned(actor, name)
        : messages.unassigned(actor, name)
    }
    case 'labels': {
      if (!id) return messages.updated(actor)
      const [label] = await tx
        .select({ name: labels.name })
        .from(labels)
        .where(and(eq(labels.id, id), eq(labels.projectId, row.projectId)))
      if (!label) return messages.updated(actor)
      return entry.to !== null
        ? messages.labeled(actor, plain(label.name))
        : messages.unlabeled(actor, plain(label.name))
    }
    case 'description':
      return messages.described(actor)
    default:
      return messages.updated(actor)
  }
}

// Runs as the person notified, so nothing is sent once they can no longer
// open the task or have already read the notification in the app.
export function emailNotification(deps: {
  appUrl: string
  send: (mail: Mail) => Promise<void>
}): Handler {
  return async (raw, tx) => {
    const job = payload.parse(raw)
    await asTenant(tx, { ...job, email: '' })
    const [row] = await tx
      .select({
        reason: notifications.reason,
        actorId: notifications.actorId,
        historyField: taskHistory.field,
        historyFrom: taskHistory.from,
        historyTo: taskHistory.to,
        historyActorEmail: taskHistory.actorEmail,
        commentBody: comments.body,
        commentAuthorEmail: comments.authorEmail,
        projectId: projects.id,
        project: projects.name,
        boardId: boards.id,
        board: boards.name,
        key: sql<string>`${boards.keyPrefix} || '-' || ${tasks.number}`,
        title: tasks.title,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        dueZone: tasks.dueZone,
        // A zone Intl accepted but Postgres does not know must not fail the job.
        dueAt: sql<string | null>`case when ${tasks.dueTime} is null then null
          else to_char((${tasks.dueDate} + ${tasks.dueTime}) at time zone (
            select coalesce(min(name), 'UTC') from pg_timezone_names where name = ${tasks.dueZone}
          ) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end`,
        section: sections.name,
        email: projectMembers.email,
        language: userSettings.language,
        timezone: userSettings.timezone
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
      .leftJoin(sections, eq(sections.id, tasks.sectionId))
      .leftJoin(userSettings, settingsOfMember)
      .leftJoin(taskHistory, eq(taskHistory.id, notifications.historyId))
      .leftJoin(comments, eq(comments.id, notifications.commentId))
      .where(
        and(
          eq(notifications.id, job.notificationId),
          isNull(notifications.readAt)
        )
      )
    if (!row) return undefined

    const lang = languageOf(row.language)
    const messages = NOTIFICATION_MESSAGES[lang]
    const base = deps.appUrl.replace(/\/$/, '')
    const link = `${base}/boards/${row.boardId}?task=${encodeURIComponent(row.key)}`
    const why: Why =
      row.reason === 'assigned' ||
      row.reason === 'mentioned' ||
      row.reason === 'reminder'
        ? row.reason
        : 'following'

    const comment =
      row.commentBody === null
        ? undefined
        : { body: row.commentBody, authorEmail: row.commentAuthorEmail }
    const entry =
      row.historyField === null
        ? null
        : { field: row.historyField, from: row.historyFrom, to: row.historyTo }
    const person = await nameOf(tx, row.projectId, row.actorId)
    const actorEmail =
      person?.email ??
      comment?.authorEmail ??
      row.historyActorEmail ??
      undefined
    const actor = plain(person?.name || actorEmail || messages.someone)

    const title = plain(row.title)
    const task = `${row.key} ${title}`
    const due = row.dueAt
      ? formatInstant(
          lang,
          new Date(row.dueAt),
          row.dueZone ? (row.timezone ?? row.dueZone) : 'UTC'
        )
      : row.dueDate
        ? formatDay(lang, row.dueDate)
        : null

    const event =
      why === 'assigned'
        ? messages.assignedYou(actor)
        : why === 'mentioned'
          ? messages.mentionedYou(actor)
          : why === 'reminder'
            ? messages.reminder(due)
            : comment
              ? messages.commented(actor)
              : await describe(tx, row, entry, messages, lang, actor)
    const subject =
      why === 'assigned'
        ? messages.subjects.assigned(actor, task)
        : why === 'mentioned'
          ? messages.subjects.mentioned(actor, task)
          : why === 'reminder'
            ? messages.subjects.reminder(task)
            : task

    const quote = comment
      ? await withNames(tx, row.projectId, plain(plainText(comment.body)))
      : ''
    const chars = Array.from(quote)
    const excerpt =
      chars.length > QUOTE_LENGTH
        ? `${chars.slice(0, QUOTE_LENGTH).join('').trimEnd()}…`
        : quote
    const crumb = `${plain(row.project)} › ${plain(row.board)}`
    const facts = [
      due && `${messages.due} ${due}`,
      row.priority && messages.priorityLabel(String(row.priority)),
      row.section && plain(row.section)
    ].filter((fact): fact is string => Boolean(fact))

    const text = [
      event,
      '',
      task,
      crumb,
      facts.join(' · '),
      ...(excerpt ? ['', `“${excerpt}”`] : []),
      '',
      `${messages.open}: ${link}`,
      '',
      messages.why[why](row.key),
      `${messages.all}: ${base}/notifications`,
      ''
    ].join('\n')

    const html = layout({
      lang,
      appName: APP_NAME,
      context: escape(plain(row.project)),
      preheader: escape(excerpt || facts.join(' · ') || event),
      body: [
        why === 'reminder'
          ? `<p class="m-warn" style="margin:0 0 18px;padding:10px 14px;border-radius:8px;background:${COLORS.warnSoft};color:${COLORS.warn};font-size:14px;font-weight:600;">${escape(event)}</p>`
          : eventRow(event, actor, actorEmail ?? actor),
        taskCard({
          crumb,
          key: row.key,
          title,
          due,
          dueLabel: messages.due,
          priority: row.priority,
          priorityLabel: row.priority
            ? messages.priorityLabel(String(row.priority))
            : null,
          section: row.section && plain(row.section)
        }),
        excerpt
          ? `<p class="m-quote m-ink" style="margin:16px 0 0;padding:12px 14px;border-radius:8px;background:${COLORS.quote};font-size:14px;line-height:1.5;color:${COLORS.ink};"><strong>${escape(actor)}</strong><br>${escape(excerpt)}</p>`
          : ''
      ].join('\n'),
      action: { label: messages.open, href: link, fallback: messages.fallback },
      footer: `${escape(messages.why[why](row.key))}<br><a href="${escape(`${base}/notifications`)}" class="m-muted" style="color:${COLORS.muted};">${escape(messages.all)}</a> &middot; ${APP_NAME}`
    })

    await deps.send({ to: row.email, subject, text, html })
    return undefined
  }
}

function eventRow(event: string, actor: string, seed: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;"><tr>
<td width="36" height="36" align="center" valign="middle" style="width:36px;height:36px;border-radius:18px;background:${colorOf(seed)};color:#ffffff;font-size:14px;font-weight:600;line-height:36px;">${escape(initials(actor))}</td>
<td class="m-ink" style="padding-left:12px;font-size:15px;line-height:1.4;color:${COLORS.ink};">${escape(event)}</td>
</tr></table>`
}

function taskCard(card: {
  crumb: string
  key: string
  title: string
  due: string | null
  dueLabel: string
  priority: number | null
  priorityLabel: string | null
  section: string | null
}): string {
  const fact = (content: string) =>
    `<span class="m-muted" style="display:inline-block;margin:0 16px 4px 0;font-size:13px;color:${COLORS.muted};">${content}</span>`
  const strong = (content: string) =>
    `<b class="m-ink" style="font-weight:500;color:${COLORS.ink};">${escape(content)}</b>`
  const facts = [
    card.due && fact(`${escape(card.dueLabel)} ${strong(card.due)}`),
    card.priority &&
      card.priorityLabel &&
      fact(
        `<span style="display:inline-block;width:8px;height:8px;border-radius:4px;margin-right:6px;background:${PRIORITY_COLORS[card.priority] ?? COLORS.muted};"></span>${strong(card.priorityLabel)}`
      ),
    card.section && fact(strong(card.section))
  ].filter(Boolean)
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="m-soft" style="background:${COLORS.soft};border:1px solid ${COLORS.line};border-radius:10px;padding:16px 18px;">
<p class="m-muted" style="margin:0 0 6px;font-size:12px;color:${COLORS.muted};">${escape(card.crumb)}</p>
<p class="m-ink" style="margin:0;font-size:19px;font-weight:600;line-height:1.3;color:${COLORS.ink};"><span class="m-chip" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;font-weight:600;color:${COLORS.muted};background:${COLORS.card};border:1px solid ${COLORS.line};border-radius:5px;padding:1px 6px;margin-right:6px;vertical-align:2px;">${escape(card.key)}</span>${escape(card.title)}</p>
${facts.length ? `<p style="margin:12px 0 0;">${facts.join('')}</p>` : ''}
</td></tr></table>`
}
