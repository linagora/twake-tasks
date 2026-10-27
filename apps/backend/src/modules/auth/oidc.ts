import { createRemoteJWKSet, jwtVerify } from 'jose'
import * as client from 'openid-client'
import { z } from 'zod'
import { fullName } from './fullName.ts'

const organizationRole = z.enum(['owner', 'admin', 'moderator', 'member'])
export type OrganizationRole = z.infer<typeof organizationRole>

export interface Identity {
  subject: string
  // The LDAP entryUUID: the person, whatever their email.
  userId: string
  email: string
  name: string | null
  sessionId: string
  expiresAt: Date
  organizationId: string | null
  organizationRole: OrganizationRole | null
  // The token was issued to another app, and is good on search routes alone.
  searchOnly: boolean
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
  searchAudiences: readonly string[]
}

const BACKCHANNEL_LOGOUT_EVENT =
  'http://schemas.openid.net/event/backchannel-logout'

const userinfoSchema = z.object({
  sub: z.string().min(1),
  sid: z.string().min(1),
  uuid: z.uuid(),
  email: z.email(),
  name: z.string().nullish().catch(null),
  given_name: z.string().nullish().catch(null),
  family_name: z.string().nullish().catch(null),
  org_id: z.string().min(1).nullish(),
  org_role: organizationRole.nullish().catch(null)
})

// The name claim can be the uid (it is LemonLDAP's cn), so the given and
// family names come first.
function nameOf(claims: z.infer<typeof userinfoSchema>): string | null {
  return (
    fullName(claims.given_name, claims.family_name) ||
    claims.name?.trim() ||
    null
  )
}

// openid-client URL-encodes Basic credentials, turning "-" into "%2D", and
// LemonLDAP only decodes them from 2.23. Raw ones work on every version as
// long as the id and secret hold no "%" or ":".
function rawClientSecretBasic(clientSecret: string): client.ClientAuth {
  return (_server, { client_id }, _body, headers) => {
    headers.set(
      'authorization',
      `Basic ${btoa(`${client_id}:${clientSecret}`)}`
    )
  }
}

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
    rawClientSecretBasic(options.clientSecret),
    { timeout: 5 }
  )
  const metadata = config.serverMetadata()
  if (!metadata.jwks_uri) {
    throw new Error(`${metadata.issuer} publishes no jwks_uri`)
  }
  const jwks = createRemoteJWKSet(new URL(metadata.jwks_uri))

  return {
    async identify(accessToken) {
      const token = await client.tokenIntrospection(config, accessToken)
      if (
        !token.active ||
        token.exp === undefined ||
        token.exp * 1000 <= Date.now()
      ) {
        return null
      }
      const searchOnly = !hasAudience(token.aud, options.audience)
      if (
        searchOnly &&
        !options.searchAudiences.some(audience =>
          hasAudience(token.aud, audience)
        )
      ) {
        return null
      }
      const userinfo = await client.fetchUserInfo(
        config,
        accessToken,
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- the subjects are compared below, refusing the token instead of throwing
        client.skipSubjectCheck
      )
      const parsed = userinfoSchema.safeParse(userinfo)
      if (!parsed.success) return null
      const claims = parsed.data
      if (token.sub !== undefined && token.sub !== claims.sub) return null

      return {
        subject: claims.sub,
        userId: claims.uuid,
        email: claims.email,
        name: nameOf(claims),
        sessionId: claims.sid,
        expiresAt: new Date(token.exp * 1000),
        organizationId: claims.org_id ?? null,
        organizationRole: claims.org_role ?? null,
        searchOnly
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
