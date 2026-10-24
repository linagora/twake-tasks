# Configuration

## Backend

Read from the environment, and from `apps/backend/.env` in development. The backend refuses to start on a missing or invalid value. Defaults are in parentheses.

Required:

- `DATABASE_URL`: a `postgres://` URL, with a role that is not a superuser.
- `RABBITMQ_URL`: an `amqp://` or `amqps://` URL.
- `APP_URL`: the public URL of the frontend, used in the links of the emails.
- `OIDC_ISSUER`: the SSO's `https://` URL.
- `OIDC_CLIENT_SECRET`: the secret of the backend's client.

SSO:

- `OIDC_CLIENT_ID` (`twaketasks-backend`): the backend's confidential client.
- `OIDC_AUDIENCE` (`twaketasks`): the audience access tokens must carry.

Search:

- `SEARCH_MIN_LENGTH` (`2`): the fewest characters `GET /api/search?q=` searches for, after trimming. A shorter query finds no task, without touching the database. Give the frontend's `SEARCH_MIN_LENGTH` the same value.

Search from another app, such as TwakeSpace's Ctrl+K, which calls `GET /api/search?q=` from the browser with the user's own token:

- `OIDC_SEARCH_AUDIENCES` (empty): other audiences, comma separated, whose tokens `GET /api/search` also takes, such as `twakespace`. Every other route still takes `OIDC_AUDIENCE` alone.
- `SEARCH_ALLOWED_ORIGINS` (empty): bare origins, comma separated, such as `https://space.example.com`, allowed to call `GET /api/search` across origins. No other route allows any.

Space mode:

- `SPACE_INTEGRATION` (`false`). See [modes](modes.md#space-mode).
- `LDAP_REST_URL`, `LDAP_REST_SECRET`: required when `SPACE_INTEGRATION=true`.
- `LDAP_REST_SERVICE_ID` (`twake-tasks`): the service id the requests are signed as.

Email:

- `SMTP_URL`: an `smtp://` or `smtps://` URL. Without it, nothing is emailed.
- `MAIL_FROM` (`Twake Project <tasks@twake.app>`).

RabbitMQ:

- `RABBITMQ_CONCURRENCY` (`5`): how many events each replica handles at once. Each holds a database connection, so keep it well under `DATABASE_POOL_MAX`.

RabbitMQ names, when the broker's differ:

- `RABBITMQ_SPACE_EXCHANGE` (`space`)
- `RABBITMQ_B2B_EXCHANGE` (`b2b`)
- `RABBITMQ_AUTH_EXCHANGE` (`auth`)
- `RABBITMQ_SETTINGS_EXCHANGE` (`settings`)
- `RABBITMQ_ACTIVITY_EXCHANGE` (`activity`)
- `RABBITMQ_QUEUE` (`twake-tasks`), whose dead letter queue is `<queue>.dlq`
- `RABBITMQ_OLD_QUEUE` (`platform.all.twake-tasks`), the queue of older versions, drained at start (see [events](events.md#the-queue)). The backend refuses to start when it equals `RABBITMQ_QUEUE`.
- `RABBITMQ_DEAD_LETTER_EXCHANGE` (`twake-tasks.dlx`)
- `RABBITMQ_LIVE_EXCHANGE` (`twake-tasks.live`), for [live updates](events.md#live-updates) between replicas

Database:

- `DATABASE_POOL_MAX` (`20`): how many connections each replica keeps at most for requests, events and jobs. Each replica also keeps one more connection, which answers `/health/ready`, so a busy pool never fails the probe.
- `DATABASE_STATEMENT_TIMEOUT_MS` (`5000`): how long a statement of a request may run before Postgres cancels it. The request then gets 503. Jobs, RabbitMQ events and migrations have no such limit. `0` turns it off.

Server:

- `HTTP_HOST` (`0.0.0.0`), `HTTP_PORT` (`8080`).
- `HTTP_TRUSTED_PROXY_HOPS` (`2`): how many proxies in front of the backend add the address they got the request from to `X-Forwarded-For`. The backend trusts that many hops when it reads the caller's address. `2` fits the chart: the ingress, then the frontend's nginx. Set `0` when nothing proxies the backend. Too low groups every caller under the proxy's address. Too high lets a caller pick its own.
- `LOG_LEVEL` (`info`): `fatal`, `error`, `warn`, `info`, `debug` or `trace`.

Rate limits:

- `REDIS_URL`: a `redis://` or `rediss://` URL. The replicas share their rate limit counters there. Without it, each replica counts in memory, so a budget then holds per replica. While Redis is unreachable, the limits let every request through and the backend logs a warning.
- A request past a limit gets 429 with `Retry-After`, in seconds.
- Every limit takes `0` to turn it off, for example on a large office behind one address.

A budget is two variables: `<NAME>_MAX` requests in a window of `<NAME>_WINDOW_SECONDS`. Each window starts at its first request.

Per user, once the token is checked. A user is counted across all their tokens, tabs and organizations. Each request draws on `RATE_LIMIT_USER_REQUESTS`, and on the budgets of its route:

- `RATE_LIMIT_USER_REQUESTS` (`600` in `60`): every request.
- `RATE_LIMIT_USER_WRITES` (`120` in `60`): every `POST`, `PUT`, `PATCH` and `DELETE`.
- `RATE_LIMIT_TASK_CREATES` (`60` in `60`): new tasks and subtasks.
- `RATE_LIMIT_COMMENTS` (`30` in `60`): new comments.
- `RATE_LIMIT_REACTIONS` (`60` in `60`): reactions added or removed.
- `RATE_LIMIT_REMINDERS` (`30` in `60`): new reminders.
- `RATE_LIMIT_LABEL_EDITS` (`30` in `60`): labels created or changed.
- `RATE_LIMIT_BOARD_CREATES` (`20` in `3600`): new boards.
- `RATE_LIMIT_INVITES` (`30` in `3600`) and `RATE_LIMIT_INVITES_DAILY` (`100` in `86400`): invitations sent. The emails also keep their own limit of 20 an hour per inviter.
- `RATE_LIMIT_SEARCH` (`60` in `60`): `GET /api/search` from Tasks.
- `RATE_LIMIT_OTHER_APP_SEARCH` (`30` in `60`): `GET /api/search` with a token of `OIDC_SEARCH_AUDIENCES`, in place of `RATE_LIMIT_SEARCH`.
- `RATE_LIMIT_PEOPLE_SEARCH` (`60` in `60`): people suggested when sharing a board.
- `RATE_LIMIT_HEAVY_READS` (`120` in `60`): a board, my tasks, the agenda, a saved filter's tasks, a task's history and comments, a board's archive and trash, together.
- `RATE_LIMIT_STREAM_CONNECTS` (`30` in `60`): live board streams opened.
- `RATE_LIMIT_OPEN_STREAMS` (`10`): live board streams a user keeps open at once on each replica. Each open tab of a board holds one.

Per address, before a user is known:

- `RATE_LIMIT_REFUSED_TOKENS` (`30` in `60`): tokens the SSO refuses. Past that, the address gets 429 until the window ends, except for tokens already checked.
- `RATE_LIMIT_TOKEN_CHECKS_PER_ADDRESS` (`5`): tokens of one address being checked at once. Past that, the address gets 429.
- `RATE_LIMIT_LOGOUT_REFUSALS` (`60` in `60`): logout tokens that `POST /api/auth/backchannel-logout` refuses.

Per replica:

- `RATE_LIMIT_TOKEN_CHECKS` (`50`): tokens checked with the SSO at once. Past that, the backend answers 503.
- `RATE_LIMIT_REFUSED_TOKEN_CACHE_SECONDS` (`60`) and `RATE_LIMIT_REFUSED_TOKEN_CACHE_SIZE` (`10000`): how long, and how many, refused tokens are remembered, so they are refused again without asking the SSO.

## Frontend

The image writes `/.env.js` and the security headers from the container's environment at start. In development, write `apps/frontend/public/.env.js` yourself (see [development](development.md)). A value must hold on one line.

SSO, all required (the app refuses to start without them):

- `SSO_BASE_URL`: the SSO's URL.
- `SSO_CLIENT_ID`: the browser's client, `twaketasks`.
- `SSO_SCOPE`: `openid email profile`, plus `workplaceFqdn` for the [platform top bar](modes.md#platform-top-bar).
- `SSO_REDIRECT_URI`: `<frontend URL>/auth/callback`.
- `SSO_POST_LOGOUT_REDIRECT`: where to land after signing out.

Backend:

- `API_UPSTREAM`: the backend's bare origin (`http://backend:8080`), which `/api/` is proxied to. Without it, `/api/` answers 404. nginx ignores the search domains of `resolv.conf`, so in Kubernetes give the service's full name.
- `NGINX_WORKER_CONNECTIONS` (`4096`): connections each nginx worker holds at once. A live board stream holds two, one from the browser and one to the backend, for as long as its tab stays open. nginx raises its open file limit to twice this.

Security headers. The image builds the Content Security Policy itself, adding the origins of `SSO_BASE_URL` and `SENTRY_DSN`. These add to it:

- `CSP_FRAME_ANCESTORS`: the hosts allowed to frame the [embedded pages](modes.md#embedded-in-twakespace), such as TwakeSpace.
- `CSP_IMG_SRC`: the hosts people's pictures come from, on Twake Workplace.
- `CSP_CONNECT_SRC`, `CSP_FRAME_SRC`: any other source.
- `PERMISSIONS_POLICY`: replaces the default policy, which turns off the accelerometer, geolocation, gyroscope, magnetometer, payment and USB.

Sources are space separated, and must not hold double quotes, backslashes, dollar signs, semicolons or commas.

Search:

- `SEARCH_MIN_LENGTH` (`2`): the fewest characters the search screen searches for. Give it the backend's `SEARCH_MIN_LENGTH`.

Error reporting: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_FEEDBACK_ENABLED`. See [error reporting](error-reporting.md).

Twake Drive:

- `DRIVE_PICKER_ENABLED=true` adds a Drive button to the toolbar of the task description and of comments. It opens the Twake Drive file picker and inserts a public, read-only sharing link for each file or folder picked. Off by default. It needs `workplaceFqdn` in `SSO_SCOPE` and the workplace origins in `CSP_CONNECT_SRC`, like the platform top bar.
- The picker is a frame served by the Drive app of each workplace (with flat subdomains, `alice.twake.app` serves it on `alice-drive.twake.app`): add those origins to `CSP_FRAME_SRC`, for example `https://*.twake.app`.
