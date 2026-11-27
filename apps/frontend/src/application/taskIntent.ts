// The cozy-stack intent `CREATE io.cozy.tasks`: another app of the Workplace
// frames `/intents?intent=<id>` to have a task created.

/** A task saved on the server. */
export interface SavedTask {
  boardId: string
  id: string
  key: string
  title: string
}

/** What the client of the intent gets; `cancel` gives it null instead. */
export interface IntentResult {
  id: string
  key: string
  title: string
  url: string
}

/**
 * The part of cozy-interapp's service the page uses. It takes one answer
 * (`terminate`, `cancel` or `throw`) and throws on a second one.
 */
export interface IntentService {
  getIntent: () => { attributes: { action: string; type: string } }
  getData: () => unknown
  terminate: (result: IntentResult) => void
  cancel: () => void
  throw: (error: Error) => void
  notifyReadyToUse: () => void
  /** Hides the close button of the client: the form has its own. */
  hideCross: () => void
}

/**
 * Whether the path is one of the intents page, its sign-in callback included.
 * Used by: the composition root (`index.tsx`, `App`).
 */
export const isIntentsPath = (pathname: string): boolean =>
  /^\/intents(\/|$)/.test(pathname)
