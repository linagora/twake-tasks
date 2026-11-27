import { vi } from 'vitest'

import type { SessionService, User } from '@/application/session'

export const fakeUser = (idToken: string | null = null): User => ({
  name: 'Alice Martin',
  email: 'alice@example.com',
  workplaceFqdn: 'alice.twake.test',
  idToken
})

export function fakeSession(
  start: () => Promise<User | null> = () => Promise.resolve(fakeUser())
): SessionService & { endElsewhere: () => void } {
  // Every listener, as in twake-oidc: a second one never hides the first
  const listeners = new Set<() => void>()
  return {
    start: vi.fn(start),
    signIn: vi.fn(() => Promise.resolve<User | null>(null)),
    signOut: vi.fn(() => Promise.resolve()),
    onEndedElsewhere: callback => {
      listeners.add(callback)
      return () => {
        listeners.delete(callback)
      }
    },
    endElsewhere: () => {
      listeners.forEach(listener => {
        listener()
      })
    }
  }
}
