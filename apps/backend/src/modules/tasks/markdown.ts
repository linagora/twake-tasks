import type { Nodes } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmTaskListItemFromMarkdown } from 'mdast-util-gfm-task-list-item'
import { gfmTaskListItem } from 'micromark-extension-gfm-task-list-item'

const CONTAINERS = new Set(['root', 'list', 'listItem', 'blockquote'])

// The mentions the database's comment trigger notifies.
export const MENTION = /(^|\s)@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]*[A-Za-z0-9])/g

export function mentionedEmails(text: string): Set<string> {
  return new Set(
    [...text.matchAll(MENTION)].map(match => (match[2] ?? '').toLowerCase())
  )
}

// A mention reads as the person's name, as it does in the app.
export function withNames(
  text: string,
  nameOf: (email: string) => string | null | undefined
): string {
  return text.replace(MENTION, (mention, space: string, email: string) => {
    const name = nameOf(email.toLowerCase())
    return name ? `${space}@${name}` : mention
  })
}

// Iterative: authors can nest blocks and emphasis thousands deep, past the
// call stack. Same output as mdast-util-to-string, plus a line break between
// a container's children.
function textOf(root: Nodes): string {
  let text = ''
  const pending: (Nodes | string)[] = [root]
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (typeof node === 'string') text += node
    else if ('value' in node) text += node.value
    else if ('alt' in node && node.alt) text += node.alt
    else if ('children' in node) {
      const between = CONTAINERS.has(node.type) ? '\n' : ''
      for (let i = node.children.length - 1; i >= 0; i--) {
        pending.push(node.children[i] as Nodes)
        if (i > 0 && between) pending.push(between)
      }
    }
  }
  return text
}

export function plainText(markdown: string): string {
  return textOf(
    fromMarkdown(markdown, {
      extensions: [gfmTaskListItem()],
      mdastExtensions: [gfmTaskListItemFromMarkdown()]
    })
  )
}
