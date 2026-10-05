# Twake Tasks

Task management for Twake Workplace.

## Run it

You need Node 24 and Docker.

```bash
npm ci
docker compose up -d
cp apps/backend/.env.example apps/backend/.env
```

Fill in `OIDC_CLIENT_SECRET` in `apps/backend/.env`, then put your SSO settings in `apps/frontend/public/.env.js`:

```js
var SSO_BASE_URL = 'https://sign-up.twake.app/'
var SSO_CLIENT_ID = 'twaketasks'
var SSO_SCOPE = 'openid email profile'
var SSO_REDIRECT_URI = 'http://localhost:3000/auth/callback'
var SSO_POST_LOGOUT_REDIRECT = 'http://localhost:3000/'
```

Start the backend and the frontend, and open http://localhost:3000.

```bash
npm run dev -w @twake-tasks/backend
npm run dev -w @twake-tasks/frontend
```

Run `npm run check` before you push. It's what CI runs.
