import { createRemoteJWKSet, jwtVerify } from 'jose'
import * as client from 'openid-client'
import { z } from 'zod'

const organizationRole = z.enum(['owner', 'admin', 'moderator', 'member'])
export type OrganizationRole = z.infer<typeof organizationRole>

export interface Identity {
  subject: string
  // The LDAP entryUUID: the person, whatever their email.
  userId: string
  email: string
  sessionId: string
  expiresAt: Date
  organizationId: string | null
  organizationRole: OrganizationRole | null
}

export interface IdentityProvider {
  identify: (accessToken: string) => Promise<Identity | null>
  verifyLogoutToken: (logoutToken: string) => Promise<string>
}

export interface OidcOptions {
  issuer: URL
  clientId: string
  clientSecret: string
  audience: string
}

const BACKCHANNEL_LOGOUT_EVENT =
  'http://schemas.openid.net/event/backchannel-logout'

const userinfoSchema = z.object({
  sub: z.string().min(1),
  sid: z.string().min(1),
  uuid: z.uuid(),
  email: z.email(),
  org_id: z.string().min(1).nullish(),
  org_role: organizationRole.nullish().catch(null)
})

function hasAudience(aud: string | string[] | undefined, audience: string) {
  return Array.isArray(aud) ? aud.includes(audience) : aud === audience
}

export async function discoverIdentityProvider(
  options: OidcOptions
): Promise<IdentityProvider> {
  const config = await client.discovery(
    options.issuer,
    options.clientId,
    undefined,
    client.ClientSecretBasic(options.clientSecret),
    { timeout: 5 }
  )
  const metadata = config.serverMetadata()
  if (!metadata.jwks_uri) {
    throw new Error(`${metadata.issuer} publishes no jwks_uri`)
  }
  const jwks = createRemoteJWKSet(new URL(metadata.jwks_uri))

  return {
    async identify(accessToken) {
      const [introspection, userinfo] = await Promise.allSettled([
        client.tokenIntrospection(config, accessToken),
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- runs in parallel with introspection, the subjects are compared below
        client.fetchUserInfo(config, accessToken, client.skipSubjectCheck)
      ])
      if (introspection.status === 'rejected') throw introspection.reason
      const token = introspection.value
      if (
        !token.active ||
        token.exp === undefined ||
        token.exp * 1000 <= Date.now() ||
        !hasAudience(token.aud, options.audience)
      ) {
        return null
      }
      if (userinfo.status === 'rejected') throw userinfo.reason
      const parsed = userinfoSchema.safeParse(userinfo.value)
      if (!parsed.success) return null
      const claims = parsed.data
      if (token.sub !== undefined && token.sub !== claims.sub) return null

      return {
        subject: claims.sub,
        userId: claims.uuid,
        email: claims.email,
        sessionId: claims.sid,
        expiresAt: new Date(token.exp * 1000),
        organizationId: claims.org_id ?? null,
        organizationRole: claims.org_role ?? null
      }
    },

    async verifyLogoutToken(logoutToken) {
      const { payload } = await jwtVerify(logoutToken, jwks, {
        issuer: metadata.issuer,
        audience: options.audience,
        requiredClaims: ['iat', 'sid', 'events']
      })
      const events = z.record(z.string(), z.unknown()).safeParse(payload.events)
      if (
        !events.success ||
        typeof events.data[BACKCHANNEL_LOGOUT_EVENT] !== 'object' ||
        'nonce' in payload ||
        typeof payload.sid !== 'string'
      ) {
        throw new Error('not a back-channel logout token')
      }
      return payload.sid
    }
  }
}
