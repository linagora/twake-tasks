# Data lifecycle

When a row goes, for every table in the database. A row ends in one of four ways:

- Cascade: a foreign key deletes it with the row it belongs to.
- Removal path: code deletes it when something ends, such as a person losing access to a project or an account being deleted.
- Retention: it is deleted once it is older than a fixed period.
- Kept: it stays forever.

Five things end:

- A task, purged 30 days after it is trashed.
- A person's access to a project: removed by hand or by a space event. Their access to a task also ends when the task, or its board, moves to a project they are not in.
- A person, deleted by a platform event.
- An organization, deleted by a platform event.
- A project: deleted with its space, or erased with its organization.

A test fails when a table is missing from this page, and the backend test suite fails when a row outlives what it belongs to (`apps/backend/src/testing/invariants.ts`).

## Projects

- `projects`: deleted with their organization, or with their creator for a personal project. A project deleted with its space is marked deleted, then purged 30 days later. A project left without boards, when its last board moves to another project, is marked deleted and kept.
- `project_members`: cascade with the project. Removed when the person leaves, is removed, or their account is deleted.
- `project_invites`: cascade with the project. Removed when the invite is claimed or canceled.
- `invite_emails`: cascade with the project. Removed with the person who sent or got them. Retention: one day, pruned when the next invitation email is sent, since it only rate limits them.
- `boards`: cascade with the project.
- `sections`: cascade with the board, or deleted by hand.
- `labels`: cascade with the project.
- `board_favorites`: cascade with the board, or deleted by hand.
- `board_layouts`: cascade with the board.
- `saved_filters`: deleted by hand, or removed with the person or their organization. No board cascades to them.
- `spaces`: cascade with the project of the space.

## Tasks

- `tasks`: cascade with the board. A trashed task is purged by a `purge-task` job 30 days later, and its sub-tasks with it.
- `task_assignees`: cascade with the task, or deleted by hand. Removed when the person loses access to the task, or with the person.
- `task_followers`: cascade with the task, or deleted by hand. Removed when the person loses access to the task, or with the person.
- `task_reminders`: cascade with the task, or deleted by hand. Removed when the person loses access to the task, or with the person.
- `task_labels`: cascade with the task or the label, or deleted by hand. Removed when the task or its board moves to a project without the label.
- `comments`: cascade with the task. Kept after their author's account is deleted, with the author's name as it was.
- `comment_reactions`: cascade with the comment, or deleted by hand. Removed with the person.
- `task_history`: cascade with the task. Kept as long as the task, with the actor's name as it was.
- `notifications`: cascade with the task. Removed when the person loses access to the task, or with the person. Read notifications are kept.
- `notification_email_budgets`: one row per person who got a notification email. Kept, even after the person is deleted.

## Jobs and events

- `jobs`: deleted once done, or after the 10th failed attempt. A job about a task cascades with it through `task_id`, a reminder job goes with its reminder, and the jobs of an organization go with it. The jobs of a deleted person are kept until they run.
- `outbox`: retention: one day after the event is sent.
- `processed_events`: retention: 30 days, far longer than any redelivery.
- `parked_events`: deleted once the event is handled, or once it is sent to the dead letter queue after waiting 30 minutes for its space.
- `last_changes`: kept, so a late event cannot bring back a deleted organization, space or person.

## People

- `user_settings`: removed with the person, by email.
- `oidc_revoked_sessions`: retention: until the session would have expired, pruned when the next session is revoked.
