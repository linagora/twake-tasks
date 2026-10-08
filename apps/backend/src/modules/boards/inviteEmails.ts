import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { asTenant } from '../../infra/db.ts'
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
  body: (who: string, board: string, as: string, project: string) => string
  as: (role: string) => string
  someone: string
  roles: Record<string, string>
  open: string
  fallback: string
  why: string
}

const MESSAGES: Record<Language, Messages> = {
  en: {
    subject: (who, board) => `${who} shared "${board}" with you`,
    body: (who, board, as, project) =>
      `${who} shared the board "${board}" with you, ${as}. It belongs to the project "${project}", whose boards you can now open.`,
    as: role => `as ${role}`,
    someone: 'Someone',
    roles: { admin: 'admin', editor: 'editor', viewer: 'viewer' },
    open: 'Open board',
    fallback: 'Or open this link:',
    why: 'You get this email because a board was shared with you.'
  },
  fr: {
    subject: (who, board) => `${who} partage « ${board} » avec vous`,
    body: (who, board, as, project) =>
      `${who} partage le tableau « ${board} » avec vous, ${as}. Il appartient au projet « ${project} », dont vous pouvez maintenant ouvrir les tableaux.`,
    as: role =>
      /^[aeiouéh]/.test(role) ? `en tant qu'${role}` : `en tant que ${role}`,
    someone: 'Quelqu’un',
    roles: { admin: 'administrateur', editor: 'éditeur', viewer: 'lecteur' },
    open: 'Ouvrir le tableau',
    fallback: 'Ou ouvrez ce lien :',
    why: 'Vous recevez cet e-mail car un tableau a été partagé avec vous.'
  },
  de: {
    subject: (who, board) => `${who} hat „${board}“ mit dir geteilt`,
    body: (who, board, as, project) =>
      `${who} hat das Board „${board}“ mit dir geteilt, ${as}. Es gehört zum Projekt „${project}“, dessen Boards du jetzt öffnen kannst.`,
    as: role => `als ${role}`,
    someone: 'Jemand',
    roles: { admin: 'Admin', editor: 'Bearbeiter', viewer: 'Betrachter' },
    open: 'Board öffnen',
    fallback: 'Oder öffne diesen Link:',
    why: 'Du erhältst diese E-Mail, weil ein Board mit dir geteilt wurde.'
  },
  it: {
    subject: (who, board) => `${who} ha condiviso «${board}» con te`,
    body: (who, board, as, project) =>
      `${who} ha condiviso la bacheca «${board}» con te, ${as}. Appartiene al progetto «${project}», di cui ora puoi aprire le bacheche.`,
    as: role => `come ${role}`,
    someone: 'Qualcuno',
    roles: { admin: 'amministratore', editor: 'editor', viewer: 'lettore' },
    open: 'Apri la bacheca',
    fallback: 'Oppure apri questo link:',
    why: 'Ricevi questa email perché una bacheca è stata condivisa con te.'
  },
  es: {
    subject: (who, board) => `${who} compartió «${board}» contigo`,
    body: (who, board, as, project) =>
      `${who} compartió el tablero «${board}» contigo, ${as}. Pertenece al proyecto «${project}», cuyos tableros ya puedes abrir.`,
    as: role => `como ${role}`,
    someone: 'Alguien',
    roles: { admin: 'administrador', editor: 'editor', viewer: 'lector' },
    open: 'Abrir el tablero',
    fallback: 'O abre este enlace:',
    why: 'Recibes este correo porque compartieron un tablero contigo.'
  },
  ru: {
    subject: (who, board) => `${who} поделился(-ась) доской «${board}»`,
    body: (who, board, as, project) =>
      `${who} поделился(-ась) с вами доской «${board}», ${as}. Она входит в проект «${project}», доски которого теперь вам доступны.`,
    as: role => `с ролью «${role}»`,
    someone: 'Кто-то',
    roles: { admin: 'администратор', editor: 'редактор', viewer: 'читатель' },
    open: 'Открыть доску',
    fallback: 'Или откройте ссылку:',
    why: 'Вы получили это письмо, потому что с вами поделились доской.'
  },
  vi: {
    subject: (who, board) => `${who} đã chia sẻ "${board}" với bạn`,
    body: (who, board, as, project) =>
      `${who} đã chia sẻ bảng "${board}" với bạn, ${as}. Bảng thuộc dự án "${project}", giờ bạn có thể mở các bảng của dự án này.`,
    as: role => `với vai trò ${role}`,
    someone: 'Ai đó',
    roles: { admin: 'quản trị', editor: 'biên tập', viewer: 'người xem' },
    open: 'Mở bảng',
    fallback: 'Hoặc mở liên kết này:',
    why: 'Bạn nhận email này vì có người đã chia sẻ một bảng với bạn.'
  }
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
    const lang = languageOf(settings?.language)
    const messages = MESSAGES[lang]
    const who = plain(inviter?.name || inviter?.email || messages.someone)
    const role = messages.roles[invite.role] ?? invite.role
    const link = `${deps.appUrl.replace(/\/$/, '')}/boards/${job.boardId}`
    const name = plain(board.name)
    const project = plain(board.project)
    const body = messages.body(who, name, messages.as(role), project)
    await deps.send({
      to: email,
      subject: messages.subject(who, name),
      text: `${body}\n\n${link}\n`,
      html: layout({
        lang,
        appName: APP_NAME,
        context: escape(project),
        preheader: escape(body),
        body: `<p class="m-ink" style="margin:0 0 20px;font-size:15px;line-height:1.5;color:${COLORS.ink};">${escape(body)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="m-soft" style="background:${COLORS.soft};border:1px solid ${COLORS.line};border-radius:10px;padding:16px 18px;">
<p class="m-muted" style="margin:0 0 6px;font-size:12px;color:${COLORS.muted};">${escape(project)}</p>
<p class="m-ink" style="margin:0;font-size:19px;font-weight:600;line-height:1.3;color:${COLORS.ink};">${escape(name)}</p>
<p class="m-muted" style="margin:12px 0 0;font-size:13px;color:${COLORS.muted};">${escape(messages.as(role))}</p>
</td></tr></table>`,
        action: {
          label: messages.open,
          href: link,
          fallback: messages.fallback
        },
        footer: `${escape(messages.why)}<br>${APP_NAME}`
      })
    })
    return undefined
  }
}
