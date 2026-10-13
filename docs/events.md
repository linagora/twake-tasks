# Events

The backend talks to the rest of Twake Workplace through RabbitMQ only. The exchange and queue names below are the defaults; each can be changed in the [configuration](configuration.md#backend).

## The queue

- One queue, `platform.all.twake-tasks`, bound to every routing key below.
- It is a single active consumer, taking one message at a time: with several replicas, events are still handled one by one, in the order they were published.
- Each event is handled once, deduplicated on its message id. Settings updates carry none, so they are deduplicated on their content.
- A transient failure, such as the database being down, retries until it passes.
- An event that fails 5 times, or that the backend rejects, goes to the dead letter exchange `twake-tasks.dlx`, so the events behind it go on.
- Never replay a space event from the dead letter queue: it could undo newer ones, and the nightly space repair fixes what it missed. An account deletion can be replayed once its cause is fixed.

## Consumed

Accounts, in every mode:

- `domain.user.deleted` on `b2b`: forgets a person of an organization.
- `user.deleted` on `auth`: forgets a B2C person.
- `domain.organization.deleted` on `b2b`: deletes the organization's projects, filters and pending jobs.

When a person is forgotten, their Personal project, filters, settings, invitations and memberships go. A project whose only admin leaves goes to its oldest editor, or is deleted when it has none. Managed projects are left to their space.

Settings, in every mode:

- `user.settings.updated` on `settings`: the language, timezone, theme, picture and name of a person, from common settings. The app shows them, and the emails use the language and timezone. An update older than the one held is ignored.

Spaces, in [space mode](modes.md#space-mode) only (the queue stays bound to them in standalone, and they are ignored):

- `twake.space.created`, `twake.space.updated`, `twake.space.deleted`
- `twake.space.member.added`, `twake.space.member.role.changed`, `twake.space.member.removed`
- `twake.space.synced`, `twake.space.sync.completed`

All on the `space` exchange. An event dated more than a day ahead is rejected, since it would make every later event of its space look stale.

## Published

- `twake.space.sync.requested` on `space`, at start, in space mode, while no space is known yet.
- `com.twake.tasks.space.provisioned.v1` on `activity`, once a space has its project. A CloudEvent whose data holds the space id and the project (`{ kind: 'project', id }`), which tells TwakeSpace the project to show for the space.

## Live updates

```mermaid
sequenceDiagram
  participant W as Write (transaction)
  participant K as twake-tasks.live exchange
  participant R as Every replica
  participant FE as Browser
  W->>W: bumps the board version
  Note over W: published once the transaction commits
  W->>K: board.changed {boardId, version}
  K-->>R: one exclusive queue per replica
  R->>FE: data: {version} on /api/boards/<id>/events
```

- Every write to a board bumps its version, and publishes `board.changed` with `{boardId, version}` on the `twake-tasks.live` exchange once the transaction commits. A rolled back change publishes nothing.
- Every replica consumes from its own exclusive, auto-deleted queue, `twake-tasks.live.replica.<uuid>`, and sends the version to each stream open on that board.
- Delivery is best effort. A replica that is disconnected publishes nothing, a failed publish is not retried, and a message published while a replica is disconnected is lost. A stream sends the board's current version when it opens, and the browser reloads the board when the version is newer than its own.
