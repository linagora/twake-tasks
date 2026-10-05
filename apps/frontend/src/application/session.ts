export interface User {
  name: string | null
  email: string | null
}

export interface SessionService {
  /** Resolves to null when the browser is being sent to the SSO. */
  start: () => Promise<User | null>
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  onEndedElsewhere: (onEnded: () => void) => () => void
}
