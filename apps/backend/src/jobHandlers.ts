import type { Budget } from './config.ts'
import type { LdapRest } from './infra/ldapRest.ts'
import type { Mail } from './infra/mail.ts'
import {
  emailDigest,
  emailNotification,
  NOTIFICATION_DIGEST_JOB,
  NOTIFICATION_EMAIL_JOB
} from './modules/notifications/index.ts'
import {
  emailInvite,
  PROJECT_INVITE_EMAIL_JOB
} from './modules/projects/index.ts'
import {
  PURGE_SPACE_JOB,
  purgeSpace,
  reconcileJobs
} from './modules/spaces/index.ts'
import {
  deliverReminder,
  PURGE_JOB,
  purgeTask,
  REMINDER_JOB
} from './modules/tasks/index.ts'
import { RETENTION_JOB, retention, type Retention } from './retention.ts'
import type { Handler } from './scheduler/scheduler.ts'

/** Every job kind the app runs. The space jobs need the ldap-rest client. */
export function jobHandlers(deps: {
  appUrl: string
  budget: Budget
  send: (mail: Mail) => Promise<void>
  retention: Retention
  ldapRest?: LdapRest | undefined
}): Record<string, Handler> {
  const { appUrl, budget, send } = deps
  return {
    [RETENTION_JOB]: retention(deps.retention),
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
