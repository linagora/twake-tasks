# Twake Project

Task management for Twake Workplace: projects, boards and tasks, standalone or with a project for each TwakeSpace space.

## Quick start

You need Node 24 and Docker.

```bash
npm ci
docker compose up -d
cp apps/backend/.env.example apps/backend/.env
```

Set `OIDC_CLIENT_SECRET` in `apps/backend/.env`, write your SSO settings in `apps/frontend/public/.env.js`, then:

```bash
npm run dev -w @twake-tasks/backend
npm run dev -w @twake-tasks/frontend
```

Open http://localhost:3000. The details are in [development](docs/development.md).

Run `npm run check` before you push. It's what CI runs.

## Documentation

- [Architecture](docs/architecture.md)
- [Dependencies](docs/dependencies.md)
- [Modes](docs/modes.md): standalone, space mode, embedded in TwakeSpace
- [Events](docs/events.md)
- [Configuration](docs/configuration.md)
- [Development](docs/development.md)
- [Deployment](docs/deployment.md)
- [Error reporting and feedback](docs/error-reporting.md)
