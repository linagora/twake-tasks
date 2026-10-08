export const APP_NAME = 'Twake Project'

export const LANGUAGES = ['en', 'fr', 'de', 'it', 'es', 'ru', 'vi'] as const
export type Language = (typeof LANGUAGES)[number]

export function languageOf(setting: string | null | undefined): Language {
  const code = setting?.toLowerCase().split(/[-_]/)[0]
  return LANGUAGES.find(language => language === code) ?? 'en'
}

// A name cannot add a line of its own to the mail.
export const plain = (text: string): string =>
  text
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const escape = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

export const COLORS = {
  ground: '#f3f6f9',
  card: '#ffffff',
  ink: '#121a24',
  muted: '#5f6c7d',
  line: '#e3e8ee',
  soft: '#f5f8fb',
  brand: '#0a7fc2',
  quote: '#f1f8fd',
  warn: '#b45309',
  warnSoft: '#fff4e5'
}

// Mail clients drop <style> blocks unevenly, so every rule is inline and the
// dark palette only refines what the clients that support it show.
const DARK = `
@media (prefers-color-scheme: dark) {
  .m-ground { background: #0d1218 !important; }
  .m-card { background: #161d26 !important; border-color: #26303c !important; }
  .m-soft { background: #1c2530 !important; border-color: #26303c !important; }
  .m-quote { background: #132634 !important; }
  .m-ink { color: #e8edf3 !important; }
  .m-muted { color: #9aa6b6 !important; }
  .m-chip { background: #161d26 !important; border-color: #26303c !important; color: #9aa6b6 !important; }
  .m-warn { background: #2a2010 !important; color: #f5a524 !important; }
}`

export interface Layout {
  lang: Language
  appName: string
  // The project the mail is about, beside the app name.
  context: string
  preheader: string
  body: string
  action: { label: string; href: string; fallback: string }
  footer: string
}

// Only action.href is escaped here: user text in the other fields must already be.
export function layout(mail: Layout): string {
  const href = escape(mail.action.href)
  return `<!doctype html>
<html lang="${mail.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>${DARK}</style>
</head>
<body class="m-ground" style="margin:0;padding:0;background:${COLORS.ground};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${mail.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="m-ground" style="background:${COLORS.ground};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:${FONT};">
<tr><td style="padding:0 4px 18px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="28" height="28" align="center" valign="middle" style="width:28px;height:28px;border-radius:8px;background:#00b0f5;background-image:linear-gradient(225deg,#00b0f5,#00d17a);color:#ffffff;font-size:16px;font-weight:700;line-height:28px;">&#10003;</td>
<td class="m-ink" style="padding-left:10px;font-size:15px;font-weight:600;color:${COLORS.ink};">${mail.appName} <span class="m-muted" style="color:${COLORS.muted};font-weight:500;">&middot; ${mail.context}</span></td>
</tr></table>
</td></tr>
<tr><td class="m-card" style="background:${COLORS.card};border:1px solid ${COLORS.line};border-radius:14px;padding:28px;">
${mail.body}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;"><tr>
<td style="border-radius:8px;background:${COLORS.brand};"><a href="${href}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${mail.action.label}</a></td>
</tr></table>
<p class="m-muted" style="margin:14px 0 0;font-size:12px;line-height:1.5;color:${COLORS.muted};word-break:break-all;">${mail.action.fallback} <a href="${href}" style="color:${COLORS.muted};">${href}</a></p>
</td></tr>
<tr><td class="m-muted" style="padding:18px 4px 0;font-size:12px;line-height:1.6;color:${COLORS.muted};">${mail.footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`
}
