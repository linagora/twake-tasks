import type { Nodes } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmTaskListItemFromMarkdown } from 'mdast-util-gfm-task-list-item'
import { toString } from 'mdast-util-to-string'
import { gfmTaskListItem } from 'micromark-extension-gfm-task-list-item'

const CONTAINERS = new Set(['root', 'list', 'listItem', 'blockquote'])

// The mentions the database's comment trigger notifies.
export const MENTION = /(^|\s)@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]*[A-Za-z0-9])/g

export function mentionedEmails(text: string): Set<string> {
  return new Set(
    [...text.matchAll(MENTION)].map(match => (match[2] ?? '').toLowerCase())
  )
}

function textOf(node: Nodes): string {
  return CONTAINERS.has(node.type) && 'children' in node
    ? node.children.map(textOf).join('\n')
    : toString(node)
}

export function plainText(markdown: string): string {
  return textOf(
    fromMarkdown(markdown, {
      extensions: [gfmTaskListItem()],
      mdastExtensions: [gfmTaskListItemFromMarkdown()]
    })
  )
}
