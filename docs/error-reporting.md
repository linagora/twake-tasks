# Error reporting and feedback

The frontend reports errors to Sentry, and can offer a feedback button. Both are set on the frontend container:

- `SENTRY_DSN` turns Sentry on. Without it the app runs without Sentry. The image adds the DSN's origin (not its key) to the `connect-src` of the Content Security Policy.
- `SENTRY_ENVIRONMENT` sets the environment of the events.
- `SENTRY_FEEDBACK_ENABLED=true` shows the feedback button in the app shell, once `SENTRY_DSN` is set. Off by default, and never shown on the embedded pages.

## What is sent

- Errors only: no tracing, no session replay.
- Events carry the tag `app: twake-tasks` and the frontend version as release.
- They hold no user name or email. The feedback form has an optional email field, left empty.
- URLs lose their query strings and the `Referer` header is dropped, since they can hold the sign-in code or what people searched for.

Feedback needs Sentry 24.4.2 or later. See [ADR 011](https://github.com/linagora/twake-space-architecture/blob/e7f0311227c4e6c3222e81fe77b1e69e869156bf/ADR011.md).

## The backend

The backend reports to Sentry too, once its own container has `SENTRY_DSN`, with `SENTRY_ENVIRONMENT` as for the frontend. It sends:

- Every log line at `error` level or above, and crashes. A failed relay run, a dropped job and a server error each make one event.
- Errors only: no tracing and no logs.
- The tag `app: twake-tasks-backend` and the backend version as release.
- The log message and the job kind or routing key, but no other field of the line: no request, no caller and no id.
- Error messages without email addresses, and a failed query without its parameters, since they hold what people wrote.

## The feedback button

It comes from `@linagora/twake-feedback`.

- Drag it to move it. It snaps to the left or right edge, and the browser remembers where you left it.
- Without a mouse, `Shift+F10` (or the context menu key) on the button opens a menu to move it left or right, or to reset its position.
- The form opens on the same side, in the language of the app.
