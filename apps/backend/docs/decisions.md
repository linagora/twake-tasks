# Decisions

Decisions taken on @twake-tasks/backend, oldest first. Append only: a decision that changes gets a new entry that replaces the old one and cites it. Entry format: the `twake-decisions` skill of [linagora/twake-guidelines](https://github.com/linagora/twake-guidelines/blob/main/skills/twake-decisions/SKILL.md).

Categories: UX, UI, Product, Architecture, Infra, Tech.

## 2026-11-24, [Architecture] A read checks access and answers in one transaction

- Decision: a GET board or project route, other than a stream, runs its access check and its handler in one transaction, and the stores reuse the role the check found; a write keeps a transaction for the check and one for the handler.
- Decided by: agent (issue [#825](https://github.com/linagora/twake-tasks/issues/825)), to be confirmed by Khaled Ferjani
- Why: a task panel opens with six small reads, and each paid for two transactions and the same access join twice.
- Scope: every board and project route; the revocation lookup per request is unchanged, since caching it is a product decision.

## 2026-11-24, [Tech] The statements every request runs are built once

- Decision: the board access check is written as SQL text, and the revoked session lookup is a Drizzle prepared statement. Other queries keep the query builder.
- Decided by: agent (issue [#833](https://github.com/linagora/twake-tasks/issues/833)), to be confirmed by Khaled Ferjani
- Why: in a profile, Drizzle building the same SQL took 18% of the main thread's busy time and 46% of its allocations.
- Scope: `roleOn`, the board route access check, `isRevoked`.

## 2026-11-24, [Tech] Large answers are serialized from their contract schema

- Decision: a route may declare its answer's contract schema; Fastify then compiles it into a serializer, which writes only the properties the contract declares. The large reads declare one; other routes keep `JSON.stringify`.
- Decided by: agent (issue [#864](https://github.com/linagora/twake-tasks/issues/864)), to be confirmed by Khaled Ferjani
- Why: in a profile under load, `JSON.stringify` of answers took 7.9% of the main thread, most of it on the whole board.
- Scope: `GET /boards/:boardId`, `/boards`, `/search`, `/my-tasks`, `/agenda`, `/notifications`.

## 2026-11-24, [Infra] Idle background work stays off the database

- Decision: the daily `retention` job deletes sent outbox events, not the relay on every run; the scheduler measures due jobs every 15 s instead of on each 5 s tick.
- Decided by: agent (issue [#832](https://github.com/linagora/twake-tasks/issues/832)), to be confirmed by Khaled Ferjani
- Why: an idle backend ran an outbox delete every 500 ms and a count per job kind every 5 s, a fixed database load whatever the traffic.
- Scope: the outbox relay, the `retention` job, the scheduler's `jobs_due` and `jobs_oldest_due_seconds` gauges and its "jobs are late" warning. Sent events may now stay up to two days.

## 2026-11-24, [Infra] A back-channel logout is kept for a set number of days

- Decision: the daily `retention` job deletes a revoked session `RETENTION_REVOKED_SESSIONS_DAYS` (default 90) after its logout. This replaces keeping every revocation for good (#805).
- Decided by: agent (issue [#848](https://github.com/linagora/twake-tasks/issues/848)), to be confirmed by Khaled Ferjani
- Why: kept for good, the table grows with every logout for as long as the product runs, and every authenticated request looks into it.
- Scope: `oidc_revoked_sessions`, the `retention` job.
