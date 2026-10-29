# Deployment

## Images

- `ghcr.io/linagora/twake-tasks-backend`
- `ghcr.io/linagora/twake-tasks-frontend`

Each push to `main` publishes `latest`. A release tag publishes the version.

Both images listen on port 8080 and run as a non-root user. The frontend runs on a read-only root filesystem, with a writable `/tmp`.

Probes:

- backend: `/health/live`, and `/health/ready`, which answers once the backend has started, while it reaches the database, over a connection of its own, and once the database holds every migration of its image;
- frontend: `/healthz`.

The backend can run several replicas. RabbitMQ events, the jobs and the outbox relay are shared between them safely (see [architecture](architecture.md#backend)).

See [configuration](configuration.md) for the settings and [dependencies](dependencies.md) for the services they point to.

## Migrations

The backend image also holds the migrate command, `node dist/migrate.js`. Run it once per release, as an init container or a pre-upgrade job, and set `MIGRATE_ON_START=false` on the replicas.

By default each replica migrates at start instead. Either way, a migration holds a Postgres advisory lock, so replicas and the command starting together migrate one at a time.

A replica that starts before the migrations of its image ran logs which ones it lacks and stays not ready until they run.

## Releases

The backend and the frontend are released apart, by pushing a tag on `main`:

- `backend-v<version>`
- `frontend-v<version>`

The version must equal the one in the app's `package.json`. The release checks the app, publishes its image and writes the GitHub release notes.

### Backend and frontend versions

A frontend can run against an older or a newer backend. Both read their request and response shapes from [packages/api-contract](../packages/api-contract), and keep to these rules:

- Within a 0.x minor version, the backend only adds optional response fields, and accepts every request the previous frontend release sends.
- A breaking change takes a new path, or keeps the old field until the next frontend release.
- Any change to `packages/api-contract` bumps its version. The backend's `/health/live` returns it in the `contract` field.
- When a response does not match the contract, the frontend reports it to Sentry with the tag `api-contract`, and still uses it if it is a JSON object.

## Registry archive

Twake Project shows in the Twake Workplace home and bar as a standalone app (`"standalone": true` in the manifest). The registry archive ships no code: [manifest/manifest.webapp](../manifest/manifest.webapp) and its icon are the whole archive.

The home and the bar open the URL held by the `project.embedded-app-url` flag instead of a subdomain, so set that flag to the frontend's URL on each context.

Every frontend release publishes the archive on the dev channel of the registry as `<version>-dev.<commit>`, through [publish-manifest.yml](https://github.com/linagora/twake-workflows/blob/fffcd66cb995c51022cb1f985f934752b3bb0c5b/.github/workflows/publish-manifest.yml). The version comes from the tag; the manifest carries none.
