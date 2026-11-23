# Decisions

Decisions taken on twake-tasks, oldest first. Append only: a decision that changes gets a new entry that replaces the old one and cites it. Entry format: the `twake-decisions` skill of [linagora/twake-guidelines](https://github.com/linagora/twake-guidelines/blob/main/skills/twake-decisions/SKILL.md).

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

## 2026-11-24, [Infra] The relay deletes the events it publishes

- Decision: the outbox relay deletes each event it publishes, in the transaction that read it, instead of marking it sent. The daily `retention` job still deletes the events a replica on the previous release marked sent. Replaces the outbox part of "Idle background work stays off the database".
- Decided by: agent (issue [#849](https://github.com/linagora/twake-tasks/issues/849)), to be confirmed by Khaled Ferjani
- Why: no code reads a sent event, yet keeping it a day held about half of the database growth per task created, and marking it sent wrote every event twice.
- Scope: the outbox relay and the `retention` job. The `sent_at` column and its index are dropped in a later release, once no release still writing them can serve.

## 2026-11-24, [Infra] A person keeps their 50 newest read notifications

- Decision: the daily `retention` job also deletes a person's read notifications past their 50 newest read ones, the number the list shows. The 180 day limit (`RETENTION_READ_NOTIFICATIONS_DAYS`) stays. Unread notifications are kept.
- Decided by: agent (issue [#847](https://github.com/linagora/twake-tasks/issues/847)), to be confirmed by Khaled Ferjani
- Why: `GET /notifications` returns the newest 50 and nothing else reads old read ones, yet they stayed 180 days, several hundred rows per active person.
- Scope: `notifications`, the `retention` job, `GET /notifications`. The ranking counts read ones on a project in the trash, which the list hides, so while it waits for its purge the list may show fewer than 50.

## 2026-11-24, [Product] A scheduled task's due date and its previous task

- Decision: a template's schedule may set when its task is due, as one of a fixed set of kinds counted from the day the run was planned for, in the schedule's zone: N days later, day D (or the last day) of that month or of N months later, or the last day of that quarter or of N quarters later, each with an optional time. With "overwrite", a run cancels the open tasks of earlier runs: it moves each to its board's canceled section, cancels it in place on a board without sections, and archives it on a board with sections but no canceled one. "Keep" is the default.
- Decided by: agent (issue [#761](https://github.com/linagora/twake-tasks/issues/761)), following the decisions posted on the issue, to be confirmed by Khaled Ferjani
- Why: a task appears when it is time to start on it, which is not tied to its deadline by a fixed offset (a report made on the 25th is due on the 5th of the next month), and some work only matters in its latest occurrence (a daily pass on open pull requests).
- Scope: `template_schedules.due` and `.previous`, the `template_schedule` job, the template dialog on Settings. A missed run still makes one task, due from the run it was planned for, not from when it ran.

## 2026-11-24, [Architecture] The task panel opens with one details request

- Decision: `GET /boards/:boardId/tasks/:taskId/details` answers the description, comments, history, links, reminders and following of a task with one access check; the web app reads it when the panel opens, and each part reads again on its own route after a write or a board change. A failed details read fails every part of the panel at once.
- Decided by: [issue #837](https://github.com/linagora/twake-tasks/issues/837), agent (workflow wf_39bd7774-7d3), to be confirmed by Khaled Ferjani
- Why: each request pays the revocation lookup and an access check, and the panel sent five of them on opening, six with the History tab.
- Scope: backend task routes, the api-contract package, the frontend task panel queries.

## 2026-11-24, [Architecture] A request checks its session in its transaction

- Decision: every tenant transaction of a request looks its session up in `oidc_revoked_sessions` within the statement that opens it, and refuses a revoked one with 401. A board or project route, whose access check opens such a transaction before its handler, runs no lookup of its own; any other authenticated route still runs it before its handler. A logout is still seen by every replica on its next request. This replaces the revocation part of the scope of "A read checks access and answers in one transaction".
- Decided by: Khaled Ferjani (issue [#828](https://github.com/linagora/twake-tasks/issues/828)), who chose this over a per-replica cache of the lookup
- Why: the lookup ran on its own pooled connection on every request, the statement Postgres ran most often under load, although the identity behind it is cached for 60 s.
- Scope: `asTenant`, `requireIdentity`, the authenticator, which no longer reads revocations.

## 2026-11-24, [Tech] A board opens in two statements

- Decision: `getBoard` reads the board, the person's role, its sections, members, invites, labels and the person's layout in one statement, and its tasks with their assignees, labels, comment counts, template and blockers in a second one, through correlated subqueries aggregated with `json_agg`. The other task lists describe their tasks in one statement too. The postgres.js and Drizzle protocol settings stay as they are, prepared statements stay off.
- Decided by: agent (issue [#827](https://github.com/linagora/twake-tasks/issues/827)), to be confirmed by Khaled Ferjani
- Why: each statement costs two round trips to the server, and opening a board sent fifteen of them one after the other, the most frequent request of the app.
- Scope: `loadBoard`, `describeTasksOf`. Opening a board sends 8 socket writes instead of 30, BEGIN and COMMIT included.

## 2026-11-24, [UX] My tasks offers quick actions on each task

- Decision: each task of My tasks, on a board the person can edit, offers to mark it done, push its due date by a day, and, once late, move it to today. A task in a section is done by moving to its board's first completed section; a board without one says so.
- Decided by: agent (issue [#856](https://github.com/linagora/twake-tasks/issues/856)), to be confirmed by Khaled Ferjani
- Why: asked through user feedback, to close or reschedule a task without opening it.
- Scope: My tasks only, not Today, Upcoming, filters or search. Moving a due date keeps its time and the gap to the deadline, as a drag on the calendar does.

## 2026-11-24, [Infra] Hidden source maps go to Sentry, not to browsers

- Decision: the build writes hidden source maps and Sentry debug ids. The release workflow uploads the maps to Sentry for the release, and the image leaves them out. The upload is skipped when the `SENTRY_AUTH_TOKEN` secret is absent.
- Decided by: Khaled Ferjani (issue [#913](https://github.com/linagora/twake-tasks/issues/913))
- Why: an event with minified frames only cannot be traced to a component.
- Scope: frontend releases only; pushes to main and pull requests upload nothing.

## 2026-11-24, [Tech] A label or section name is refused past 16 times its maximum before it is folded

- Decision: `uniqueName(max)` refuses a raw name longer than `16 * max` UTF-16 units before any folding, and a printable ASCII name skips the folding. The maximum on the folded name is unchanged.
- Decided by: agent (issue [#850](https://github.com/linagora/twake-tasks/issues/850)), to be confirmed by Khaled Ferjani
- Why: the folding ran over the whole body, up to 1 MiB, so an 800 KB label name cost about 2 ms of the main thread before it was refused.
- Scope: label and section names. A name padded past the bound with invisible characters or spaces is now refused instead of cleaned.

## 2026-11-24, [Tech] A time zone is looked up in the fixed list of canonical names before a formatter is built

- Decision: `isTimeZone` accepts a name of `Intl.supportedValuesOf('timeZone')`, a set built once, and builds an `Intl.DateTimeFormat` only for a name outside it. The accepted names are unchanged, and nothing is cached per request.
- Decided by: agent (issue [#851](https://github.com/linagora/twake-tasks/issues/851)), to be confirmed by Khaled Ferjani
- Why: building the formatter was about 70% of the CPU of parsing a task edit with a zone.
- Scope: every body with a zone (task edits, reminders, templates, saved filters).

## 2026-11-24, [Architecture] Decisions log at the root for an app

- Decision: The app keeps one `docs/decisions.md` at the repo root for all its workspaces (`apps/backend`, `apps/frontend`, `packages/api-contract`, `e2e`); only a library monorepo, whose packages are published on their own, keeps one log per package.
- Decided by: Crash-- (CTO), comment on [linagora/twake-contacts-frontend#688](https://github.com/linagora/twake-contacts-frontend/pull/688), 2026-11-24
- Why: the workspaces of an app ship together as one product, so its decisions belong in one log.
- Scope: the whole repository.

## 2026-11-24, [Tech] Rslint lints and rs fmt formats, from the root rstack.config.mjs

- Decision: every workspace lints with `rs lint` and formats with `rs fmt` (rstack), both reading the root `rstack.config.mjs` through `--config`; ESLint and Prettier are gone, and the rules ESLint ran stay on, the React Compiler, TanStack Query and Vitest ones through their ESLint plugins.
- Decided by: agent, asked by Théo, to be confirmed by the maintainer.
- Why: the frontend lint drops from 38 s to 5 s and the backend one from 12 s to 1 s, with the same rules.
- Scope: every workspace; the frontend, @twake-tasks/backend, @twake-tasks/e2e and @twake-tasks/api-contract.
