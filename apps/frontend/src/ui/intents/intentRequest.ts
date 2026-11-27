import { MAX_DESCRIPTION, MAX_TITLE } from '@/ui/boards/TaskPanel'

// It ends up in a URL of the stack, called with a token
const INTENT_ID = /^[A-Za-z0-9_-]+$/

/**
 * The id of the intent to serve (`/intents?intent=<id>`), null on another
 * path or for what is no cozy-stack id. Used by: `IntentPage`.
 */
export function intentIdOf({
  pathname,
  search
}: Pick<Location, 'pathname' | 'search'>): string | null {
  const id = new URLSearchParams(search).get('intent')
  return /^\/intents\/?$/.test(pathname) && id !== null && INTENT_ID.test(id)
    ? id
    : null
}

/** What the new task form is filled with. */
export interface TaskRequest {
  title: string
  /** Markdown */
  description: string
}

// Cut to what the server accepts, never in the middle of an emoji
const textOf = (value: unknown, max: number): string | null =>
  value === undefined
    ? ''
    : typeof value === 'string'
      ? value.slice(0, max).replace(/[\uD800-\uDBFF]$/, '')
      : null

/**
 * Reads the data of the client, `{ title?, description? }` or nothing: null
 * for another shape. Used by: `IntentPage`.
 */
export function parseTaskRequest(data: unknown): TaskRequest | null {
  const fields = data ?? {}
  if (typeof fields !== 'object' || Array.isArray(fields)) return null
  const { title, description } = fields as Record<string, unknown>
  const request = {
    title: textOf(title, MAX_TITLE),
    description: textOf(description, MAX_DESCRIPTION)
  }
  return request.title === null || request.description === null
    ? null
    : (request as TaskRequest)
}
