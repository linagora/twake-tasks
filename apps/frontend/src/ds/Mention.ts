import { Node } from '@tiptap/react'

// The shape the backend reads: "@", then an email, after a space or at the start.
// More lenient than the backend: comments saved before the writer stopped escaping "_"
// hold "@jean\_dupont@", shown as mentions here though they never notified anyone.
const MENTION = /^@((?:[A-Za-z0-9._%+-]|\\_)+@[A-Za-z0-9.-]*[A-Za-z0-9])/
const MENTION_START = /(?:^|\s)@(?:[A-Za-z0-9._%+-]|\\_)+@/

/**
 * Shows "@alice@example.com" as the name of the person it mentions. Emails
 * that belong to nobody in `names` stay the text they were written as, and the
 * stored markdown is always "@<email>".
 */
export function mentionExtension(names: Record<string, string>) {
  const nameOf = (email: string): string | undefined =>
    names[email.toLowerCase()]
  return Node.create({
    name: 'mention',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: false,
    addAttributes: () => ({ email: { default: '' } }),
    renderHTML: ({ node }) => {
      const email = String(node.attrs.email)
      return [
        'span',
        { class: 'mention', title: email },
        `@${nameOf(email) ?? email}`
      ]
    },
    markdownTokenName: 'mention',
    markdownTokenizer: {
      name: 'mention',
      level: 'inline',
      start: src => {
        const found = MENTION_START.exec(src)
        return found ? found.index + found[0].indexOf('@') : -1
      },
      tokenize: (src, tokens) => {
        // Like the backend, a mention follows a space or starts the text.
        if (!/(?:^|\s)$/.test(tokens.at(-1)?.raw ?? '')) return undefined
        const found = MENTION.exec(src)
        const email = found?.[1]?.replaceAll('\\_', '_')
        if (!found || !email || !nameOf(email)) return undefined
        return { type: 'mention', raw: found[0], email }
      }
    },
    parseMarkdown: token => ({
      type: 'mention',
      attrs: { email: String(token.email) }
    }),
    renderMarkdown: node => `@${String(node.attrs?.email)}`
  })
}
