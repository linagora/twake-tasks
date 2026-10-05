import { createTransport } from 'nodemailer'
import type { Logger } from 'pino'
import type { Config } from '../config.ts'
import type { Mail } from '../modules/boards/notificationEmails.ts'

// Without SMTP_URL, notifications stay in the app.
export function createMailer(
  config: Pick<Config, 'SMTP_URL' | 'MAIL_FROM'>,
  logger: Logger
): (mail: Mail) => Promise<void> {
  if (!config.SMTP_URL) {
    logger.info('SMTP_URL is not set, so no notification is emailed')
    return () => Promise.resolve()
  }
  const transport = createTransport(config.SMTP_URL)
  return async mail => {
    await transport.sendMail({ from: config.MAIL_FROM, ...mail })
  }
}
