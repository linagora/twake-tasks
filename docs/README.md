# Twake Project documentation

Start with [features](features.md) for what the app does, and [architecture](architecture.md) for how it is built.

## Developers

- [Development](development.md): run the app locally, the checks, the end to end suite, database migrations.
- [Architecture](architecture.md): the parts of the app and how they talk to each other.
- [Features](features.md): what people can do, in the terms the docs use.
- [Permissions](permissions.md): the role each API route needs, generated from the route tables.

## Operators

- [Deployment](deployment.md): images, probes, releases, and the registry archive.
- [Dependencies](dependencies.md): the services the app needs, and what it expects from each.
- [Configuration](configuration.md): every setting of the backend and the frontend.
- [Error reporting and feedback](error-reporting.md): Sentry and the feedback button.

## Integrators

- [Modes](modes.md): standalone, space mode, embedding in TwakeSpace, the platform top bar, and search from TwakeSpace.
- [Events](events.md): what the backend consumes from RabbitMQ and what it publishes.

## Design decisions

- [ADR 009](https://github.com/linagora/twake-space-architecture/blob/3ed41a5067c6b22f307f01e2e0dbfc56d1aa11d9/ADR009.md): Twake Tasks, the app's design.
- [ADR 010](https://github.com/linagora/twake-space-architecture/blob/bbcb1ffe03e5452c99325662f247dadba8fecb7c/ADR010.md): embedding apps in TwakeSpace.
- [ADR 011](https://github.com/linagora/twake-space-architecture/blob/e7f0311227c4e6c3222e81fe77b1e69e869156bf/ADR011.md): user feedback with Sentry.
