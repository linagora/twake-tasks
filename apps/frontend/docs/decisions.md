# Decisions

Decisions taken on @twake-tasks/frontend, oldest first. Append only: a decision that changes gets a new entry that replaces the old one and cites it. Entry format: the `twake-decisions` skill of [linagora/twake-guidelines](https://github.com/linagora/twake-guidelines/blob/main/skills/twake-decisions/SKILL.md).

Categories: UX, UI, Product, Architecture, Infra, Tech.

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
