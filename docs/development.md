# Development

## Run the app

You need Node 24 and Docker.

```bash
npm ci
docker compose up -d
cp apps/backend/.env.example apps/backend/.env
```

Compose starts PostgreSQL and RabbitMQ, and creates the `twake_tasks_owner` and `twake_tasks` roles and the database on a fresh volume. If your volume predates either role, recreate it with `docker compose down -v`.

Fill in `OIDC_CLIENT_SECRET` in `apps/backend/.env` (and the `LDAP_REST_*` settings for [space mode](modes.md#space-mode)), then put your SSO settings in `apps/frontend/public/.env.js`, which git ignores:

```js
var SSO_BASE_URL = 'https://sign-up.twake.app/'
var SSO_CLIENT_ID = 'twaketasks'
var SSO_SCOPE = 'openid email profile workplaceFqdn'
var SSO_REDIRECT_URI = 'http://localhost:3000/auth/callback'
var SSO_POST_LOGOUT_REDIRECT = 'http://localhost:3000/'
```

Start the backend and the frontend, and open http://localhost:3000:

```bash
npm run dev -w @twake-tasks/backend
npm run dev -w @twake-tasks/frontend
```

The frontend dev server proxies `/api` to `API_UPSTREAM`, `http://localhost:8080` by default. The backend restarts on every change.

To run the built images instead:

```bash
OIDC_CLIENT_SECRET=... docker compose --profile app up -d --build
```

The app is on http://localhost:3000 again. The SSO settings default to `sign-up.twake.app` and can be changed from the shell, with the same names as in `.env.js`, as can `APP_URL`, `SPACE_INTEGRATION` and the `LDAP_REST_*` settings.

To try the emails, run a local mail catcher such as mailpit and set `SMTP_URL=smtp://localhost:1025`.

## Checks

```bash
npm run check
```

It is what CI runs, for each workspace: lint, format, type check, tests and build. The backend tests start PostgreSQL and RabbitMQ in Docker with Testcontainers.

## End to end

The suite runs the built images in space mode, against a stub SSO and with no ldap-rest, and plays TwakeSpace on extra pages to test the embed.

```bash
./e2e/stack.sh up
npx playwright install chromium   # once, from e2e/
npm test -w @twake-tasks/e2e
./e2e/stack.sh down
```

The stack serves the app on http://localhost:3300 and the SSO on https://localhost:8443, so it runs next to the dev stack. CI runs it on the pull requests that touch the apps or the suite.

## Database migrations

Change the schema in the `schema.ts` files, then generate the migration:

```bash
npm run db:generate -w @twake-tasks/backend
```

The backend applies pending migrations at start.

During a rolling update, and after a rollback, the previous release serves on the new schema. A migration therefore only adds: a column or table is dropped, renamed, changes type, or becomes `NOT NULL` without a default only in a release after the one whose code stopped using it. Put the comment `-- contract: <reason>, unused since backend <that version>` on the line above such a statement. `npm run check` refuses one without it, or naming a version not yet released.

Database functions and triggers have their current definition in [`apps/backend/sql`](../apps/backend/sql/README.md). To change one, edit its file, then generate the migration from the files the branch changed:

```bash
npm run db:sql -w @twake-tasks/backend <name>
```
