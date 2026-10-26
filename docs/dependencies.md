# Dependencies

## PostgreSQL

- Version 16 or later. Development and the tests use 18, and one test migrates a 16 database. On a server older than 18, the backend creates the `uuidv7()` function that 18 has built in before it migrates.
- The backend runs its migrations at start, unless the migrate command runs them (see [deployment](deployment.md#migrations)).
- Its role must have neither `SUPERUSER` nor `BYPASSRLS`, since either skips the row level security that keeps organizations apart. The backend refuses to start with one.

## RabbitMQ

Required in every mode. The backend connects at start, then:

- consumes account deletions, settings updates and, in space mode, space events;
- publishes on the `activity` exchange;
- sends live board updates between its replicas on the `twake-tasks.live` exchange.

See [events](events.md) for the exchanges, routing keys and queue.

## AMQP clients

The backend talks to RabbitMQ through two clients:

- `@linagora/rabbitmq-client` runs the event consumer, the activity publisher, the live exchange and the space sync request.
- `amqplib` only counts the messages waiting on a queue and removes the old queue's bindings. The first client never removes a binding, and declares it again when it reconnects.

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

## Redis

Optional. With `REDIS_URL`, the backend replicas share their rate limit counters there.

## ldap-rest

Only in [space mode](modes.md#space-mode). The backend reads organizations, spaces, members and groups from its API, signing each request with HMAC SHA-256 as `LDAP_REST_SERVICE_ID`, with `LDAP_REST_SECRET`. It also publishes the space events the backend consumes.

## Frontend peers

No frontend code imports `@mui/lab` or `cozy-intent`. They stay in the frontend's dependencies because `@linagora/twake-mui` requires both as peers, and neither peer is optional.

## Drizzle

`drizzle-orm` and `drizzle-kit` are pinned to the release candidate `1.0.0-rc.4`. Once 1.0 is stable, move both in one PR. That PR is ready when `npm run db:generate` produces no migration and the backend tests pass.
