# Decisions

Decisions taken on @twake-tasks/backend, oldest first. Append only: a decision that changes gets a new entry that replaces the old one and cites it. Entry format: the `twake-decisions` skill of [linagora/twake-guidelines](https://github.com/linagora/twake-guidelines/blob/main/skills/twake-decisions/SKILL.md).

Categories: UX, UI, Product, Architecture, Infra, Tech.

## 2026-11-24, [Architecture] A read checks access and answers in one transaction

- Decision: a GET board or project route, other than a stream, runs its access check and its handler in one transaction, and the stores reuse the role the check found; a write keeps a transaction for the check and one for the handler.
- Decided by: agent (issue [#825](https://github.com/linagora/twake-tasks/issues/825)), to be confirmed by Khaled Ferjani
- Why: a task panel opens with six small reads, and each paid for two transactions and the same access join twice.
- Scope: every board and project route; the revocation lookup per request is unchanged, since caching it is a product decision.

## 2026-11-24, [Architecture] The task panel opens with one details request

- Decision: `GET /boards/:boardId/tasks/:taskId/details` answers the description, comments, history, links, reminders and following of a task with one access check; the web app reads it when the panel opens, and each part reads again on its own route after a write or a board change. A failed details read fails every part of the panel at once.
- Decided by: [issue #837](https://github.com/linagora/twake-tasks/issues/837), agent (workflow wf_39bd7774-7d3), to be confirmed by Khaled Ferjani
- Why: each request pays the revocation lookup and an access check, and the panel sent five of them on opening, six with the History tab.
- Scope: backend task routes, the api-contract package, the frontend task panel queries.
