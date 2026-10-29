import { createTransport } from 'nodemailer'
import type { Logger } from 'pino'
import type { Config } from '../config.ts'

export interface Mail {
  to: string
  subject: string
  text: string
  html: string
}

// Without SMTP_URL, notifications stay in the app.
export function createMailer(
  config: Pick<Config, 'SMTP_URL' | 'MAIL_FROM' | 'SMTP_TIMEOUT_SECONDS'>,
  logger: Logger
): (mail: Mail) => Promise<void> {
  if (!config.SMTP_URL) {
    logger.info('SMTP_URL is not set, so no notification is emailed')
    return () => Promise.resolve()
  }
  const timeout = config.SMTP_TIMEOUT_SECONDS * 1000
  const transport = createTransport({
    url: config.SMTP_URL,
    connectionTimeout: timeout,
    greetingTimeout: timeout,
    socketTimeout: timeout
  })
  return async mail => {
    await transport.sendMail({ from: config.MAIL_FROM, ...mail })
  }
}
