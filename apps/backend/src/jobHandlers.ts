import type { Budget } from './config.ts'
import type { LdapRest } from './infra/ldapRest.ts'
import type { Mail } from './infra/mail.ts'
import { PURGE_JOB, purgeTask } from './modules/boards/archive.ts'
import {
  emailInvite,
  PROJECT_INVITE_EMAIL_JOB
} from './modules/boards/inviteEmails.ts'
import {
  emailDigest,
  NOTIFICATION_DIGEST_JOB
} from './modules/boards/notificationDigest.ts'
import {
  emailNotification,
  NOTIFICATION_EMAIL_JOB
} from './modules/boards/notificationEmails.ts'
import { deliverReminder, REMINDER_JOB } from './modules/boards/reminderJobs.ts'
import { PURGE_SPACE_JOB, purgeSpace } from './modules/spaces/events.ts'
import { reconcileJobs } from './modules/spaces/reconcile.ts'
import type { Handler } from './scheduler/scheduler.ts'

/** Every job kind the app runs. The space jobs need the ldap-rest client. */
export function jobHandlers(deps: {
  appUrl: string
  budget: Budget
  send: (mail: Mail) => Promise<void>
  ldapRest?: LdapRest | undefined
}): Record<string, Handler> {
  const { appUrl, budget, send } = deps
  return {
    [REMINDER_JOB]: deliverReminder,
    [PURGE_JOB]: purgeTask,
    // Purges a space deleted while the integration was on.
    [PURGE_SPACE_JOB]: purgeSpace,
    [NOTIFICATION_EMAIL_JOB]: emailNotification({ appUrl, budget, send }),
    [NOTIFICATION_DIGEST_JOB]: emailDigest({ appUrl, budget, send }),
    [PROJECT_INVITE_EMAIL_JOB]: emailInvite({ appUrl, send }),
    ...(deps.ldapRest && reconcileJobs(deps.ldapRest))
  }
}
