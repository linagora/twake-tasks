// No types available for cozy-interapp: only what Tasks calls.
declare module 'cozy-interapp' {
  type FetchJSON = (
    method: string,
    path: string,
    body?: unknown
  ) => Promise<unknown>

  /** cozy-interapp attaches stop() to the promise start() returns. */
  interface StartedIntent extends Promise<unknown> {
    stop: () => void
  }

  interface CreatedIntent extends Promise<unknown> {
    start: (
      element: HTMLElement,
      options: { onReady?: () => void; onReadyToUse?: () => void }
    ) => StartedIntent
  }

  export class Intents {
    constructor(options: { fetch: FetchJSON })
    create(
      action: string,
      type: string,
      data?: Record<string, unknown>,
      permissions?: string[]
    ): CreatedIntent
  }
}
