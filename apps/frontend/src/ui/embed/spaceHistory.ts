export const EMBED_PREFIX = '/embed/projects/'

export interface EmbedLocation {
  resourceId: string
  path: string
}

export const spaceOrigins = (): string[] =>
  (window.TWAKE_SPACE_ORIGIN ?? '').split(' ').filter(Boolean)

/** Splits a URL of the embed route into the project id and what lies below it. */
export function parseEmbedUrl(
  pathname: string,
  search = '',
  hash = ''
): EmbedLocation | null {
  if (!pathname.startsWith(EMBED_PREFIX)) return null
  const rest = pathname.slice(EMBED_PREFIX.length)
  const slash = rest.indexOf('/')
  const resourceId = slash === -1 ? rest : rest.slice(0, slash)
  if (resourceId === '') return null
  const below = slash === -1 ? '' : rest.slice(slash)
  return { resourceId, path: below + search + hash }
}

/** A path from TwakeSpace is applied under the embed route: it must stay below it. */
export function isValidEmbedPath(path: unknown): path is string {
  if (typeof path !== 'string') return false
  if (path === '') return true
  if (!['/', '?', '#'].includes(path.charAt(0))) return false
  const pathname = path.split(/[?#]/, 1)[0] ?? ''
  return (
    !pathname.includes('//') &&
    !pathname.includes('\\') &&
    !pathname.split('/').includes('..')
  )
}

export function isValidResourceId(id: unknown): id is string {
  return (
    typeof id === 'string' && /^[\w.-]+$/.test(id) && id !== '.' && id !== '..'
  )
}

export function postEmbedPath(
  { resourceId, path }: EmbedLocation,
  replace: boolean
): void {
  for (const origin of spaceOrigins()) {
    window.parent.postMessage(
      { type: 'twake-embed:path', resourceId, path, replace },
      origin
    )
  }
}

let suppressed = 0

/**
 * Runs `fn` without reporting the URL it writes: TwakeSpace asked for it.
 * A router writes the URL once its navigation settles, hence the await.
 */
export async function suppress(fn: () => unknown): Promise<void> {
  suppressed += 1
  try {
    await fn()
  } finally {
    suppressed -= 1
  }
}

function reportCurrentUrl(replace: boolean): void {
  if (suppressed > 0) return
  const { pathname, search, hash } = window.location
  const location = parseEmbedUrl(pathname, search, hash)
  if (location) postEmbedPath(location, replace)
}

let uninstall: (() => void) | null = null

/**
 * In the frame, the history belongs to TwakeSpace: the app never adds an entry
 * of its own. A push becomes a replace, and every write of the URL is reported.
 * Does nothing outside the embed route. Returns a function that undoes it.
 */
export function installSpaceHistory(): () => void {
  if (!window.location.pathname.startsWith(EMBED_PREFIX)) return () => undefined
  if (uninstall) return uninstall

  const replaceState = window.history.replaceState.bind(window.history)
  window.history.pushState = (...args) => {
    replaceState(...args)
    reportCurrentUrl(false)
  }
  window.history.replaceState = (...args) => {
    replaceState(...args)
    reportCurrentUrl(true)
  }
  uninstall = () => {
    // The own properties shadow the ones of History: dropping them restores it
    Reflect.deleteProperty(window.history, 'pushState')
    Reflect.deleteProperty(window.history, 'replaceState')
    uninstall = null
  }
  return uninstall
}
