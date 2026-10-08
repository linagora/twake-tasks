import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { asTenant } from '../../infra/db.ts'
import type { Handler } from '../../scheduler/scheduler.ts'
import { userSettings } from '../settings/schema.ts'
import { memberLooks, settingsOfMember } from './access.ts'
import type { Mail } from './notificationEmails.ts'
import { boards, projectInvites, projectMembers, projects } from './schema.ts'

export const PROJECT_INVITE_EMAIL_JOB = 'project_invite_email'

const payload = z.object({
  projectId: z.uuid(),
  email: z.string(),
  boardId: z.uuid(),
  invitedBy: z.uuid(),
  organizationId: z.string().nullable()
})

interface Messages {
  subject: (who: string, board: string) => string
  body: (
    who: string,
    board: string,
    as: string,
    project: string,
    link: string
  ) => string
  as: (role: string) => string
  someone: string
  roles: Record<string, string>
}

const MESSAGES: Record<'en' | 'fr', Messages> = {
  en: {
    subject: (who, board) => `${who} shared "${board}" with you`,
    body: (who, board, as, project, link) =>
      `${who} shared the board "${board}" with you, ${as}. It belongs to the project "${project}", whose boards you can now open.\n\n${link}\n`,
    as: role => `as ${role}`,
    someone: 'Someone',
    roles: { admin: 'admin', editor: 'editor', viewer: 'viewer' }
  },
  fr: {
    subject: (who, board) => `${who} partage « ${board} » avec vous`,
    body: (who, board, as, project, link) =>
      `${who} partage le tableau « ${board} » avec vous, ${as}. Il appartient au projet « ${project} », dont vous pouvez maintenant ouvrir les tableaux.\n\n${link}\n`,
    as: role =>
      /^[aeiouéh]/.test(role) ? `en tant qu'${role}` : `en tant que ${role}`,
    someone: 'Quelqu’un',
    roles: { admin: 'administrateur', editor: 'éditeur', viewer: 'lecteur' }
  }
}

// A name cannot add a line of its own to the mail.
const plain = (text: string) =>
  text
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function languageOf(setting: string | null | undefined): 'en' | 'fr' {
  return setting?.toLowerCase().split(/[-_]/)[0] === 'fr' ? 'fr' : 'en'
}

// Runs as the person who shared, so nothing is sent once the invite is gone:
// canceled, or already claimed into a membership at the person's sign-in.
export function emailInvite(deps: {
  appUrl: string
  send: (mail: Mail) => Promise<void>
}): Handler {
  return async (raw, tx) => {
    const job = payload.parse(raw)
    await asTenant(tx, {
      userId: job.invitedBy,
      organizationId: job.organizationId,
      email: ''
    })
    const email = job.email.toLowerCase()
    const [invite] = await tx
      .select({ role: projectInvites.role })
      .from(projectInvites)
      .where(
        and(
          eq(projectInvites.projectId, job.projectId),
          eq(projectInvites.email, email)
        )
      )
    if (!invite) return undefined
    const [board] = await tx
      .select({ name: boards.name, project: projects.name })
      .from(boards)
      .innerJoin(projects, eq(projects.id, boards.projectId))
      .where(eq(boards.id, job.boardId))
    if (!board) return undefined
    const [inviter] = await tx
      .select({ email: projectMembers.email, name: memberLooks.name })
      .from(projectMembers)
      .leftJoin(userSettings, settingsOfMember)
      .where(
        and(
          eq(projectMembers.projectId, job.projectId),
          eq(projectMembers.userId, job.invitedBy)
        )
      )
    const [settings] = await tx
      .select({ language: userSettings.language })
      .from(userSettings)
      .where(eq(sql`lower(${userSettings.email})`, email))
    const messages = MESSAGES[languageOf(settings?.language)]
    const who = plain(inviter?.name || inviter?.email || messages.someone)
    const role = messages.roles[invite.role] ?? invite.role
    const link = `${deps.appUrl.replace(/\/$/, '')}/boards/${job.boardId}`
    await deps.send({
      to: email,
      subject: messages.subject(who, plain(board.name)),
      text: messages.body(
        who,
        plain(board.name),
        messages.as(role),
        plain(board.project),
        link
      )
    })
    return undefined
  }
}
