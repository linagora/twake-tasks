# Twake Project

Task management for Twake Workplace: projects, boards and tasks, standalone or with a project for each TwakeSpace space. See [features](docs/features.md).

This repository, `twake-tasks`, holds the frontend (React, served by nginx) in `apps/frontend`, the backend (Fastify, PostgreSQL, RabbitMQ) in `apps/backend`, and the end to end suite in `e2e`.

## Quick start

You need Node 24 and Docker.

```bash
npm ci
docker compose up -d
cp apps/backend/.env.example apps/backend/.env
```

Set `OIDC_CLIENT_SECRET` in `apps/backend/.env`, and put your SSO settings in `apps/frontend/public/.env.js` ([example](docs/development.md#run-the-app)). Then start both apps and open http://localhost:3000:

```bash
npm run dev -w @twake-tasks/backend
npm run dev -w @twake-tasks/frontend
```

Run `npm run check` before you push. It's what CI runs. The details are in [development](docs/development.md).

## Documentation

The [documentation index](docs/README.md) groups the pages by reader:

- Developers: [development](docs/development.md), [architecture](docs/architecture.md)
- Operators: [deployment](docs/deployment.md), [dependencies](docs/dependencies.md), [configuration](docs/configuration.md)
- Integrators: [modes](docs/modes.md) (TwakeSpace, space mode), [events](docs/events.md)
