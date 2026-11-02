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

// micromark takes time quadratic in the length of containers and in the
// emphasis marks it pairs. So plain text parses those a few thousand
// characters, or MAX_MARKS marks, at a time, and reads a line's markers past
// MAX_DEPTH, or its marks past MAX_MARKS, as text. micromark cannot be stopped
// mid-parse, so no part handed to it is much longer than MAX_PART, and plain
// text parses for BUDGET milliseconds at most.
const CHUNK = 2000
const MAX_PART = 4 * CHUNK
const MAX_DEPTH = 32
const MAX_MARKS = 1000
const BUDGET = 250
// Glued to both sides of a cut in a long line, so neither piece reads as a
// line of its own: a heading, a fence or a break.
const GLUE = 'x'

const LINE = /[^\r\n]*(?:\r\n?|\n|$)/g
const HTML =
  /^ {0,3}<(?:(pre|script|style|textarea)(?=[\s>]|$)|(!--|\?|!\[CDATA\[|![A-Za-z]))/i
const HTML_ENDS: Record<string, string> = {
  '!--': '-->',
  '?': '?>',
  '![CDATA[': ']]>'
}
const BLANK = /^[ \t]*[\r\n]*$/
const UNINDENTED = /^[^ \t\r\n]/
// A backtick fence's info string holds no backtick.
const OPENER = /(`{3,})(?=[^`]*$)|(~{3,})/y
const CLOSER = /([ \t]*)(?:(`{3,}|~{3,})[ \t]*[\r\n]*$)?/y
const QUOTE = /[ \t]*>/y
const SPACES = /[ \t]*/y
const CONTAINER = /[ \t]*(?:>|(?:[-+*]|\d{1,9}[.)])(?=[ \t]|$))/y
// A container that also starts after a paragraph's line.
const INTERRUPTING = /^ {0,3}(?:>|(?:[-+*]|1[.)])[ \t]+\S)/
// A heading, a setext underline or a thematic break.
const ENDING =
  /^ {0,3}(?:#{1,6}(?:[ \t].*)?|=+[ \t]*|-+[ \t]*|([-*_])[ \t]*(?:\1[ \t]*){2,})[\r\n]*$/
const MARKS = /\\[^]|[*_]+/g
const WORD = /[\p{L}\p{N}]/u
const SPACE = /\s/

interface Fence {
  run: string
  quotes: number
  // A line indented less than floor ends the fence's container, and so the
  // fence. A closing fence sits 3 spaces past column at most.
  floor: number
  column: number
  reopen: string
}

// The last line holding text: where its text starts, and whether it is a
// paragraph's line right before the current one.
interface Before {
  indent: number
  paragraph: boolean
}

// A chunk's text, where it starts in the markdown, and whether it starts or
// ends at a cut in a line.
interface Part {
  text: string
  start: number
  head: boolean
  tail: boolean
}

// Once half full, cut before an unindented line after a blank line outside a
// fence or an HTML block that blank lines do not end: CommonMark has closed
// every block there. Cut a paragraph before a line taking it past MAX_MARKS
// marks. Once full, cut a fence at any line, reopening it. Cut a container
// before a line opening one, or at any line once twice full, and other blocks
// after a heading or a break. A paragraph parses in linear time, so it is not
// cut before MAX_PART, where any block is, and a long line's pieces each go
// to a part of their own. Lines in a fence are capped too: a line can look
// like a fence to this and not to micromark.
function chunks(markdown: string): Part[] {
  const done: Part[] = []
  let chunk = ''
  let start = 0
  let head = false
  let tail = false
  let fence: Fence | undefined
  let html = ''
  let blank = false
  let before: Before = { indent: 0, paragraph: false }
  let ended = false
  // The line can start any block: the previous one is not a paragraph's.
  let fresh = true
  let contained = false
  let marks = 0
  for (const piece of linesOf(markdown)) {
    const line = `${piece.head ? GLUE : ''}${piece.line}${piece.tail ? GLUE : ''}`
    const inBlock = !!fence || !!html
    const closed = blank && UNINDENTED.test(line)
    if (closed) contained = false
    if (blank) marks = 0
    const capped = capDepth(line)
    const [text, pairable] = capMarks(capped)
    const counted = inBlock ? 0 : pairable
    const full =
      piece.head ||
      chunk.length >= MAX_PART ||
      marks + counted > MAX_MARKS ||
      (chunk.length >= CHUNK &&
        (!!fence ||
          (contained
            ? INTERRUPTING.test(line) || chunk.length >= 2 * CHUNK
            : ended)))
    if ((closed && chunk.length >= CHUNK / 2) || full) {
      done.push({ text: chunk, start, head, tail })
      start = piece.at
      head = piece.head
      chunk = fence?.reopen ?? ''
      contained = false
      marks = 0
    }
    tail = piece.tail
    CONTAINER.lastIndex = 0
    if (
      !inBlock &&
      (INTERRUPTING.test(line) || ((fresh || !chunk) && CONTAINER.test(line)))
    )
      contained = true
    chunk += text
    marks += counted
    const columns = expandTabs(capped)
    const open = fence
    const inHtml = html
    if (html) {
      if (line.toLowerCase().includes(html)) html = ''
    } else {
      fence = track(columns, fence, before)
      if (!open && !fence) html = htmlEnd(line)
    }
    const { indent } = scan(columns)
    before = line.trim()
      ? {
          indent,
          paragraph:
            !open &&
            !fence &&
            !inHtml &&
            !html &&
            !!columns.slice(indent).trim()
        }
      : { ...before, paragraph: false }
    ended = !fence && !html && ENDING.test(line)
    blank = !fence && !html && BLANK.test(line)
    fresh = !fence && !html && (blank || ended || inBlock || HTML.test(line))
  }
  return [...done, { text: chunk, start, head, tail }]
}

interface Piece {
  line: string
  at: number
  head: boolean
  tail: boolean
}

// A line longer than MAX_PART comes in pieces, cut before a space where one
// is near, and never inside a surrogate pair.
function* linesOf(markdown: string): Generator<Piece> {
  for (const { 0: line, index } of markdown.matchAll(LINE)) {
    let from = 0
    while (line.length - from > MAX_PART) {
      const space = line.lastIndexOf(' ', from + MAX_PART)
      let to = space > from + MAX_PART / 2 ? space : from + MAX_PART
      const code = line.charCodeAt(to)
      if (code >= 0xdc00 && code <= 0xdfff) to--
      yield {
        line: line.slice(from, to),
        at: index + from,
        head: from > 0,
        tail: true
      }
      from = to
    }
    yield {
      line: line.slice(from),
      at: index + from,
      head: from > 0,
      tail: false
    }
  }
}

// The end of the HTML block the line opens, unless it closes on that line.
function htmlEnd(line: string): string {
  const match = HTML.exec(line)
  if (!match) return ''
  const [, tag, other = ''] = match
  const end = tag ? `</${tag.toLowerCase()}>` : (HTML_ENDS[other] ?? '>')
  return line.toLowerCase().includes(end) ? '' : end
}

// The fence open after the line. Containers opened on earlier lines are not
// known, so a fence indented 4 spaces or more is taken to sit in list items.
function track(
  line: string,
  fence: Fence | undefined,
  before: Before
): Fence | undefined {
  if (!fence) return opening(line, before)
  QUOTE.lastIndex = 0
  for (let i = 0; i < fence.quotes; i++)
    if (!QUOTE.exec(line)) return opening(line, before)
  const start = QUOTE.lastIndex
  if (!line.slice(start).trim()) return fence
  CLOSER.lastIndex = start
  const [, space = '', run = ''] = CLOSER.exec(line) ?? []
  const column = start + space.length
  if (column < fence.floor) return opening(line, before)
  const closes =
    run[0] === fence.run[0] &&
    run.length >= fence.run.length &&
    column <= fence.column + 3
  return closes ? undefined : fence
}

// A line indented past the text before it, or a numbered list not starting
// at 1 inside a paragraph's container, continues that text.
function opening(line: string, before: Before): Fence | undefined {
  const { prefix, quotes, listed, first, lead, indent } = scan(line)
  OPENER.lastIndex = indent
  const [, ticks, tildes] = OPENER.exec(line) ?? []
  const run = ticks ?? tildes
  const space = indent - prefix
  if (
    !run ||
    (listed && space > 4) ||
    lead > before.indent + 3 ||
    (before.paragraph &&
      lead >= before.indent &&
      /^\d/.test(first) &&
      parseInt(first) !== 1)
  )
    return undefined
  const end = listed ? prefix : indent
  return {
    run,
    quotes,
    floor: listed ? indent : Math.max(prefix, indent - 3),
    column: listed
      ? indent
      : space < 4
        ? prefix
        : Math.max(indent - 3, Math.min(indent, before.indent)),
    reopen: `${padded(line.slice(0, end))}${line.slice(end, indent)}${run}\n`
  }
}

// Alone in a chunk, 4 spaces before a marker start indented code, so they
// become empty list items reaching the same column. A quote marker takes the
// space after it.
function padded(prefix: string): string {
  return prefix.replace(/(>?)( {4,})/g, (match, quote: string, run: string) => {
    const width = run.length - quote.length
    if (width < 4 || width > 2 * MAX_DEPTH) return match
    return `${quote}${quote && ' '}${'- '.repeat(width >> 1)}${width % 2 ? ' ' : ''}`
  })
}

// Columns as CommonMark counts them: a tab reaches the next multiple of 4.
function expandTabs(line: string): string {
  if (!line.includes('\t')) return line
  let out = ''
  for (const char of line)
    out += char === '\t' ? ' '.repeat(4 - (out.length % 4)) : char
  return out
}

// The containers a line opens or continues, as far as the line alone tells:
// where they end, the first list marker and its column, and where text starts.
function scan(line: string) {
  let prefix = 0
  let quotes = 0
  let listed = false
  let first = ''
  let lead = -1
  CONTAINER.lastIndex = 0
  for (let match; (match = CONTAINER.exec(line));) {
    const marker = match[0].trimStart()
    listed = marker !== '>'
    if (!listed) quotes++
    else if (!first) {
      first = marker
      lead = CONTAINER.lastIndex - marker.length
    }
    prefix = CONTAINER.lastIndex
  }
  SPACES.lastIndex = prefix
  SPACES.exec(line)
  const indent = SPACES.lastIndex
  return { prefix, quotes, listed, first, lead: first ? lead : indent, indent }
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

// A run of one mark between spaces, or of underscores inside a word, never
// pairs. Returns the line and the count of marks that may pair.
function capMarks(line: string): [string, number] {
  let left = MAX_MARKS
  const capped = line.replace(MARKS, (run, at: number) => {
    const before = line[at - 1] ?? ' '
    const after = line[at + run.length] ?? ' '
    const stars = run.includes('*')
    if (
      run.startsWith('\\') ||
      (stars !== run.includes('_') &&
        SPACE.test(before) &&
        SPACE.test(after)) ||
      (!stars && WORD.test(before) && WORD.test(after))
    )
      return run
    left -= run.length
    return left < 0 ? run.replace(/./g, '\\$&') : run
  })
  return [capped, MAX_MARKS - Math.max(left, 0)]
}

function parse(markdown: string) {
  return fromMarkdown(markdown, {
    extensions: [gfmTaskListItem()],
    mdastExtensions: [gfmTaskListItemFromMarkdown()]
  })
}

function definitionsOf(root: Nodes): Set<string> {
  const identifiers = new Set<string>()
  const pending: Nodes[] = [root]
  for (let node = pending.pop(); node; node = pending.pop()) {
    if (node.type === 'definition') identifiers.add(node.identifier)
    else if ('children' in node)
      for (const child of node.children) pending.push(child)
  }
  return identifiers
}

const LABEL = /\[((?:[^\\[\]]|\\[^])*)\]/g

// Case folded as micromark matches labels, without the whitespace and quote
// markers a label can span.
function squash(text: string): string {
  return text
    .toLowerCase()
    .toUpperCase()
    .toLowerCase()
    .replace(/[\s>]+/g, '')
}

// A reference resolves against the definitions of the whole document, so a
// chunk that may use one from elsewhere is read again after them. Reading
// every chunk after every definition would take time quadratic in their size.
// Out of budget, the chunks left keep their markup, and references their
// labels.
export function plainText(markdown: string, budget = BUDGET): string {
  const deadline = performance.now() + budget
  const parts = chunks(markdown)
  const trees: Nodes[] = []
  for (const part of parts) {
    if (performance.now() >= deadline) break
    trees.push(parse(part.text))
  }
  const defined = trees.map(definitionsOf)
  const byKey = new Map<string, string[]>()
  if (trees.length > 1)
    for (const id of new Set(defined.flatMap(ids => [...ids]))) {
      const key = squash(id)
      byKey.set(key, [...(byKey.get(key) ?? []), id])
    }
  const texts = trees.map((tree, i) => {
    const part = parts[i] as Part
    const used = new Set<string>()
    if (byKey.size && performance.now() < deadline)
      for (const [, key = ''] of squash(part.text).matchAll(LABEL))
        for (const id of byKey.get(key) ?? [])
          if (!defined[i]?.has(id)) used.add(id)
    let text = textOf(tree)
    if (used.size) {
      const prefix = `${[...used].map(id => `[${id}]: x\n`).join('')}\n`
      const root = parse(prefix + part.text)
      root.children = root.children.filter(
        child => (child.position?.start.offset ?? 0) >= prefix.length
      )
      text = textOf(root)
    }
    if (part.head && text.startsWith(GLUE)) text = text.slice(GLUE.length)
    if (part.tail && text.endsWith(GLUE)) text = text.slice(0, -GLUE.length)
    return text
  })
  const rest = parts[trees.length]
  if (rest) {
    const raw = markdown.slice(rest.start)
    texts.push(rest.head ? raw.trimEnd() : raw.trim())
  }
  return texts.reduce(
    (all, text, i) =>
      !text ? all : all && !parts[i]?.head ? `${all}\n${text}` : all + text,
    ''
  )
}
