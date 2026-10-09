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

Space mode:

- `SPACE_INTEGRATION` (`false`). See [modes](modes.md#space-mode).
- `LDAP_REST_URL`, `LDAP_REST_SECRET`: required when `SPACE_INTEGRATION=true`.
- `LDAP_REST_SERVICE_ID` (`twake-tasks`): the service id the requests are signed as.

Email:

- `SMTP_URL`: an `smtp://` or `smtps://` URL. Without it, nothing is emailed.
- `MAIL_FROM` (`Twake Project <tasks@twake.app>`).

RabbitMQ names, when the broker's differ:

- `RABBITMQ_SPACE_EXCHANGE` (`space`)
- `RABBITMQ_B2B_EXCHANGE` (`b2b`)
- `RABBITMQ_AUTH_EXCHANGE` (`auth`)
- `RABBITMQ_SETTINGS_EXCHANGE` (`settings`)
- `RABBITMQ_ACTIVITY_EXCHANGE` (`activity`)
- `RABBITMQ_QUEUE` (`platform.all.twake-tasks`)
- `RABBITMQ_DEAD_LETTER_EXCHANGE` (`twake-tasks.dlx`)

Server:

- `HTTP_HOST` (`0.0.0.0`), `HTTP_PORT` (`8080`).
- `LOG_LEVEL` (`info`): `fatal`, `error`, `warn`, `info`, `debug` or `trace`.

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

Security headers. The image builds the Content Security Policy itself, adding the origins of `SSO_BASE_URL` and `SENTRY_DSN`. These add to it:

- `CSP_FRAME_ANCESTORS`: the hosts allowed to frame the [embedded pages](modes.md#embedded-in-twakespace), such as TwakeSpace.
- `CSP_IMG_SRC`: the hosts people's pictures come from, on Twake Workplace.
- `CSP_CONNECT_SRC`, `CSP_FRAME_SRC`: any other source.
- `PERMISSIONS_POLICY`: replaces the default policy, which turns off the accelerometer, geolocation, gyroscope, magnetometer, payment and USB.

Sources are space separated, and must not hold double quotes, backslashes, dollar signs, semicolons or commas.

Error reporting: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_FEEDBACK_ENABLED`. See [error reporting](error-reporting.md).
