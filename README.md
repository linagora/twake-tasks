# Twake Project

Task management for Twake Workplace.

## Run it

You need Node 24 and Docker.

```bash
npm ci
docker compose up -d
cp apps/backend/.env.example apps/backend/.env
```

Fill in `OIDC_CLIENT_SECRET` in `apps/backend/.env` (and the `LDAP_REST_*` settings if you turn on `SPACE_INTEGRATION`), then put your SSO settings in `apps/frontend/public/.env.js`:

```js
var SSO_BASE_URL = 'https://sign-up.twake.app/'
var SSO_CLIENT_ID = 'twaketasks'
var SSO_SCOPE = 'openid email profile workplaceFqdn'
var SSO_REDIRECT_URI = 'http://localhost:3000/auth/callback'
var SSO_POST_LOGOUT_REDIRECT = 'http://localhost:3000/'
```

The `workplaceFqdn` scope names the person's Twake Workplace platform, which shows its top bar once it accepts the app's SSO client for token exchange. Without it the app shows its own header.

Start the backend and the frontend, and open http://localhost:3000.

```bash
npm run dev -w @twake-tasks/backend
npm run dev -w @twake-tasks/frontend
```

The backend refuses to connect to the database as a superuser, because a superuser skips the row level security that keeps organizations apart. Compose creates a `twake_tasks` role for it on a fresh volume. If your volume predates that, recreate it with `docker compose down -v`.

## Error reporting and feedback

The frontend reports errors to Sentry, and can offer a feedback button, from the runtime configuration (`/.env.js`, written from the container's environment):

| Variable                  | Effect                                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `SENTRY_DSN`              | Turns Sentry on. Without it the app runs without Sentry. The image adds the DSN's origin (not its key) to the `connect-src` of the CSP. |
| `SENTRY_ENVIRONMENT`      | The environment of the events.                                                                                                           |
| `SENTRY_FEEDBACK_ENABLED` | `true` shows the draggable feedback button in the app shell, once `SENTRY_DSN` is set. Off by default. Never shown on the embedded views.          |

Events carry the tag `app: twake-tasks` and the version of the frontend as release. They hold no user name or email: the feedback form has an optional email field, empty. Feedback needs a Sentry of 24.4.2 or later. See ADR 011.

The feedback button comes from `@linagora/twake-feedback`. Drag it to move it: it snaps to the left or right edge, and the browser remembers where you left it. Without a mouse, `Shift+F10` (or the context menu key) on the button opens a menu to move it left or right, or to reset its position. The form opens on the same side, and its texts follow the language of the app.

Run `npm run check` before you push. It's what CI runs.
