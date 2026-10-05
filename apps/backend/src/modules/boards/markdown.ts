import type { Nodes } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { toString } from 'mdast-util-to-string'

const CONTAINERS = new Set(['root', 'list', 'listItem', 'blockquote'])

function textOf(node: Nodes): string {
  return CONTAINERS.has(node.type) && 'children' in node
    ? node.children.map(textOf).join('\n')
    : toString(node)
}

export function plainText(markdown: string): string {
  return textOf(fromMarkdown(markdown))
}
