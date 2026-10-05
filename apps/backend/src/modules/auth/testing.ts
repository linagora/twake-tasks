import type { Identity } from './oidc.ts'

export function anIdentity(overrides: Partial<Identity> = {}): Identity {
  return {
    subject: 'alice@example.com',
    email: 'alice@example.com',
    sessionId: 'session-1',
    expiresAt: new Date(Date.now() + 300_000),
    organizationId: 'org-1',
    organizationRole: 'member',
    ...overrides
  }
}
