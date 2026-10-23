// The part of cozy-interapp, which has no types, the Drive picker uses.
declare module 'cozy-interapp' {
  export type CozyIntent = Promise<unknown> & {
    start: (
      element: HTMLElement,
      options?: {
        onReadyToUse?: () => void
        onHideCross?: () => void
        onShowCross?: () => void
      }
    ) => StartedCozyIntent
  }
  /** Resolves with what the service returns, null when cancelled. */
  export type StartedCozyIntent = Promise<unknown> & { stop: () => void }

  export class Intents {
    constructor(options: {
      fetch: (method: string, path: string, body?: unknown) => Promise<unknown>
    })
    create(
      action: string,
      type: string,
      data?: Record<string, unknown>,
      permissions?: string[]
    ): CozyIntent
  }
}
