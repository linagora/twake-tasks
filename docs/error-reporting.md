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

## The feedback button

It comes from `@linagora/twake-feedback`.

- Drag it to move it. It snaps to the left or right edge, and the browser remembers where you left it.
- Without a mouse, `Shift+F10` (or the context menu key) on the button opens a menu to move it left or right, or to reset its position.
- The form opens on the same side, in the language of the app.
