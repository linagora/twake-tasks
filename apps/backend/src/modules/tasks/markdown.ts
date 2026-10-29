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

// micromark takes time quadratic in the length of nested blocks and in the
// emphasis marks it pairs. So plain text parses a few thousand characters at
// a time, and reads a line's markers past MAX_DEPTH, or its marks past
// MAX_MARKS, as text.
const CHUNK = 2000
const MAX_DEPTH = 32
const MAX_MARKS = 1000

const LINE = /[^\r\n]*(?:\r\n?|\n|$)/g
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)/
const CONTAINER = /[ \t]*(?:>|(?:[-+*]|\d{1,9}[.)])(?=[ \t]|$))/y
const MARKS = /\\[^]|[*_]+/g
const WORD = /[\p{L}\p{N}]/u
const SPACE = /\s/

// Cut at a blank line outside a code fence once half full, at any line once
// full, reopening the fence it cuts. Lines in a fence are capped too: a line
// can look like a fence to this and not to micromark.
function chunks(markdown: string): string[] {
  const done: string[] = []
  let chunk = ''
  let fence = ''
  for (const [line] of markdown.matchAll(LINE)) {
    chunk += capMarks(capDepth(line))
    const [, run = '', info = ''] = FENCE.exec(line) ?? []
    if (!fence) fence = run
    else if (run[0] === fence[0] && run.length >= fence.length && !info.trim())
      fence = ''
    if (
      chunk.length >= CHUNK ||
      (chunk.length >= CHUNK / 2 && !fence && !line.trim())
    ) {
      done.push(chunk)
      chunk = fence && `${fence}\n`
    }
  }
  return [...done, chunk]
}

function capDepth(line: string): string {
  CONTAINER.lastIndex = 0
  for (let depth = 1; CONTAINER.exec(line); depth++) {
    if (depth > MAX_DEPTH) {
      const at = CONTAINER.lastIndex - 1
      return `${line.slice(0, at)}\\${line.slice(at)}`
    }
  }
  return line
}

// A run between spaces, or an underscore inside a word, never pairs.
function capMarks(line: string): string {
  let left = MAX_MARKS
  return line.replace(MARKS, (run, at: number) => {
    const before = line[at - 1] ?? ' '
    const after = line[at + run.length] ?? ' '
    if (
      run.startsWith('\\') ||
      (SPACE.test(before) && SPACE.test(after)) ||
      (run.startsWith('_') && WORD.test(before) && WORD.test(after))
    )
      return run
    left -= run.length
    return left < 0 ? run.replace(/./g, '\\$&') : run
  })
}

export function plainText(markdown: string): string {
  return chunks(markdown)
    .map(chunk =>
      textOf(
        fromMarkdown(chunk, {
          extensions: [gfmTaskListItem()],
          mdastExtensions: [gfmTaskListItemFromMarkdown()]
        })
      )
    )
    .filter(Boolean)
    .join('\n')
}
