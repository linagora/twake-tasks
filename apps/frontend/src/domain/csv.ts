const DELIMITERS = [',', ';', '\t'] as const

// A cell a spreadsheet would run as a formula.
const FORMULA = /^[=+\-@\t\r]/

// The delimiter of the first line, outside quotes: Excel writes ";" where the
// decimal separator is a comma.
function delimiterOf(text: string): string {
  const counts = new Map<string, number>(DELIMITERS.map(each => [each, 0]))
  let quoted = false
  for (const char of text) {
    if (char === '"') quoted = !quoted
    else if (!quoted && (char === '\n' || char === '\r')) break
    else if (!quoted && counts.has(char)) {
      counts.set(char, (counts.get(char) ?? 0) + 1)
    }
  }
  return [...counts].reduce((best, each) =>
    each[1] > best[1] ? each : best
  )[0]
}

/**
 * The rows of a CSV file, as RFC 4180 reads them, with empty rows left out.
 * Null when the text is not CSV.
 */
export function parseCsv(input: string): string[][] | null {
  const text = input.replace(/^\u{FEFF}/u, '')
  if (text.includes('\u{0}')) return null
  const delimiter = delimiterOf(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let at = 0
  const endRow = () => {
    row.push(cell)
    if (row.some(value => value.trim() !== '')) rows.push(row)
    row = []
    cell = ''
  }
  while (at < text.length) {
    const char = text[at] ?? ''
    if (quoted) {
      if (char === '"' && text[at + 1] === '"') {
        cell += '"'
        at += 1
      } else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"' && cell === '') quoted = true
    else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[at + 1] === '\n') at += 1
      endRow()
    } else cell += char
    at += 1
  }
  if (quoted) return null
  endRow()
  return rows.map(cells => cells.map(unescapeFormula))
}

// What `toCsv` wrote to keep a value from running as a formula.
const unescapeFormula = (value: string): string =>
  value.startsWith("'") && FORMULA.test(value.slice(1)) ? value.slice(1) : value

/**
 * Comma separated, with a byte order mark so that Excel reads it as UTF-8. A
 * value that a spreadsheet would run as a formula starts with a quote.
 */
export function toCsv(rows: readonly (readonly string[])[]): string {
  const cell = (value: string) => {
    const safe = FORMULA.test(value) ? `'${value}` : value
    return /[",\r\n]|^\s|\s$/.test(safe)
      ? `"${safe.replaceAll('"', '""')}"`
      : safe
  }
  return `\u{FEFF}${rows.map(row => row.map(cell).join(',')).join('\r\n')}\r\n`
}
