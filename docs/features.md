# Features

What people can do in Twake Project, with the terms the rest of the docs use.

## Projects and boards

- A project holds boards, labels and members. Each person has a Personal project with their Inbox, which is never shared.
- Sharing a board shares its project. Members are viewers, editors or admins.
- In [space mode](modes.md#space-mode), each TwakeSpace space gets a managed project whose members come from the space.
- A board has sections, each of a type: backlog, unstarted, started, completed or canceled. Moving a task into a completed or canceled section marks it done or canceled, and moving it out reopens it.
- A board shows as columns, a list, or a calendar of due dates. Each person picks their own layout for each board.
- An archived board is read only.

## Tasks

- A task has a key such as `DES-12`, a title, a description in Markdown, assignees, labels, a priority, a due date and sub-tasks.
- A task with a due date can repeat every N days, weeks, months or years. Completing it moves it to its next due date, counted from the due date or from the day it was completed.
- A reminder fires at a set time, or some minutes before the due date. It notifies in the app, and by email when SMTP is set.
- A task can move to another board, with its sub-tasks. Its labels follow by name.
- An archived task leaves the board without being deleted. A deleted task goes to the trash and is deleted for good after 30 days.
- Each task keeps a history of its changes.

## Comments and notifications

- Comments take Markdown, emoji reactions and `@` mentions of project members.
- People follow tasks. A change to a followed task notifies them in the app, and by email when SMTP is set.
- With the Drive picker on, a description or comment can link files from Twake Drive (see [configuration](configuration.md#frontend)).

## Finding tasks

- Today and Upcoming list a person's open tasks that are overdue or due soon: those assigned to them, and unassigned ones in projects that no space manages.
- My tasks lists every open task assigned to the person, on any board.
- Saved filters match tasks by assignee, priority, label and due date, across boards. A filter can be pinned to the sidebar.
- Search finds tasks by key, title or description. TwakeSpace can call the same search (see [modes](modes.md#search-from-twakespace)).

## Across the app

- A board open in several tabs or by several people updates live (see [events](events.md#live-updates)).
- The app speaks English, French, German, Spanish, Italian, Russian and Vietnamese, and follows the person's language, timezone and theme from Twake Workplace's common settings.
