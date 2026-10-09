# Deployment

## Images

- `ghcr.io/linagora/twake-tasks-backend`
- `ghcr.io/linagora/twake-tasks-frontend`

Each push to `main` publishes `latest`. A release tag publishes the version.

Both images listen on port 8080 and run as a non-root user. The frontend runs on a read-only root filesystem, with a writable `/tmp`.

Probes:

- backend: `/health/live`, and `/health/ready`, which answers once the backend has started and while it reaches the database;
- frontend: `/healthz`.

The backend can run several replicas. RabbitMQ events, the jobs and the outbox relay are shared between them safely (see [architecture](architecture.md#backend)).

See [configuration](configuration.md) for the settings and [dependencies](dependencies.md) for the services they point to.

## Releases

The backend and the frontend are released apart, by pushing a tag on `main`:

- `backend-v<version>`
- `frontend-v<version>`

The version must equal the one in the app's `package.json`. The release checks the app, publishes its image and writes the GitHub release notes.

## Registry archive

Twake Project shows in the Twake Workplace home and bar as a standalone app (`"standalone": true` in the manifest). The registry archive ships no code: [manifest/manifest.webapp](../manifest/manifest.webapp) and its icon are the whole archive.

The home and the bar open the URL held by the `project.embedded-app-url` flag instead of a subdomain, so set that flag to the frontend's URL on each context.

Every frontend release publishes the archive on the dev channel of the registry as `<version>-dev.<commit>`, through [publish-manifest.yml](https://github.com/linagora/twake-workflows/blob/fffcd66cb995c51022cb1f985f934752b3bb0c5b/.github/workflows/publish-manifest.yml). The version comes from the tag; the manifest carries none.
