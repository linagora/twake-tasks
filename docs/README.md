# Twake Project documentation

- [Architecture](architecture.md): the parts of the app and how they talk to each other.
- [Dependencies](dependencies.md): the services the app needs, and what it expects from each.
- [Modes](modes.md): standalone, space mode, embedded in TwakeSpace, and the platform top bar.
- [Events](events.md): what the backend consumes from RabbitMQ and what it publishes.
- [Configuration](configuration.md): every setting of the backend and the frontend.
- [Development](development.md): run the app locally, the checks, the end to end suite.
- [Deployment](deployment.md): images, probes, releases, and the registry archive.
- [Error reporting and feedback](error-reporting.md): Sentry and the feedback button.

The design decisions are in [ADR 009](https://github.com/linagora/twake-space-architecture/blob/3ed41a5067c6b22f307f01e2e0dbfc56d1aa11d9/ADR009.md) (Twake Tasks), [ADR 010](https://github.com/linagora/twake-space-architecture/blob/bbcb1ffe03e5452c99325662f247dadba8fecb7c/ADR010.md) (embedding apps in TwakeSpace) and [ADR 011](https://github.com/linagora/twake-space-architecture/blob/e7f0311227c4e6c3222e81fe77b1e69e869156bf/ADR011.md) (user feedback with Sentry).
