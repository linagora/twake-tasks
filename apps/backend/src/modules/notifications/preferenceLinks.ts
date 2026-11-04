import type { NotificationKind } from '@twake-tasks/api-contract'
import { COLORS, escape } from '../boards/index.ts'
import type { NotificationMessages } from './notificationMessages.ts'

/**
 * The links every notification email ends with. Mail clients post to the
 * one-click address of the headers instead of opening the page (RFC 8058).
 */
export function preferenceLinks(
  base: string,
  messages: NotificationMessages,
  token: string,
  kind: NotificationKind | 'all'
) {
  const query = `token=${token}&kind=${kind}`
  const settings = `${base}/settings#notifications`
  const unsubscribe = `${base}/unsubscribe?${query}`
  const link = (href: string, label: string) =>
    `<a href="${escape(href)}" class="m-muted" style="color:${COLORS.muted};">${escape(label)}</a>`
  return {
    text: [
      `${messages.settings}: ${settings}`,
      `${messages.unsubscribe}: ${unsubscribe}`
    ],
    html: `${link(settings, messages.settings)} &middot; ${link(unsubscribe, messages.unsubscribe)}`,
    headers: {
      'List-Unsubscribe': `<${base}/api/settings/notifications/unsubscribe?${query}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    }
  }
}
