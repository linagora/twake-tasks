# Dependencies

## PostgreSQL 18

- Version 18 or later: the schema uses `uuidv7()`.
- The backend runs its migrations at start.
- Its role must not be a superuser, since a superuser skips the row level security that keeps organizations apart. The backend refuses to start with one.

## RabbitMQ

Required in every mode. The backend connects at start, then:

- consumes account deletions, settings updates and, in space mode, space events;
- publishes on the `activity` exchange.

See [events](events.md) for the exchanges, routing keys and queue.

## OIDC provider

LemonLDAP in Twake Workplace, or any provider that offers discovery, introspection, userinfo and back-channel logout. It needs two clients:

- `twaketasks`, public, used by the browser. Its access tokens must carry the audience `twaketasks`.
- `twaketasks-backend`, confidential, used by the backend to introspect tokens and read userinfo. It authenticates with HTTP Basic, so its id and secret must not hold `%` or `:`.

Userinfo must hold:

- `sub`, `sid`, `email`;
- `uuid`, the LDAP entryUUID, which identifies the person whatever their email;
- optionally `org_id` and `org_role` (`owner`, `admin`, `moderator` or `member`). Without `org_id` the person is a B2C user;
- optionally `given_name` and `family_name`, preferred over `name`, which can be the uid.

Back-channel logout goes to `<APP_URL>/api/auth/backchannel-logout`. The logout token's audience is `twaketasks`.

For the platform top bar, the SSO also answers the `workplaceFqdn` scope with a claim of the same name. See [modes](modes.md#platform-top-bar).

## SMTP

Optional. Without `SMTP_URL`, notifications and project invitations stay in the app.

## ldap-rest

Only in [space mode](modes.md#space-mode). The backend reads organizations, spaces, members and groups from its API, signing each request with HMAC SHA-256 as `LDAP_REST_SERVICE_ID`, with `LDAP_REST_SECRET`. It also publishes the space events the backend consumes.
