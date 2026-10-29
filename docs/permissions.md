# Permissions

The role each API route needs, a role above it included. A caller who is not a member of the board gets 404, a member below the role gets 403.

Generated from the route tables by `apps/backend/src/modules/permissions.test.ts`, which fails when this file is stale. After changing a route, run `npx vitest run src/modules/permissions.test.ts -u` in `apps/backend`.

## Any signed-in person, on their own data

- `GET /api/agenda`
- `GET /api/boards`
- `POST /api/boards`
- `GET /api/filters`
- `POST /api/filters`
- `DELETE /api/filters/:filterId`
- `PATCH /api/filters/:filterId`
- `DELETE /api/filters/:filterId/favorite`
- `PUT /api/filters/:filterId/favorite`
- `GET /api/filters/:filterId/tasks`
- `GET /api/key-prefixes/:keyPrefix`
- `GET /api/labels`
- `GET /api/my-tasks`
- `GET /api/notifications`
- `POST /api/notifications/:notificationId/read`
- `POST /api/notifications/read`
- `GET /api/notifications/unread`
- `GET /api/people`
- `GET /api/projects`
- `GET /api/search`
- `GET /api/settings`

## Viewers of the board

- `GET /api/boards/:boardId`
- `GET /api/boards/:boardId/archived`
- `DELETE /api/boards/:boardId/favorite`
- `PUT /api/boards/:boardId/favorite`
- `PUT /api/boards/:boardId/layout`
- `GET /api/boards/:boardId/tasks/:taskId/comments`
- `POST /api/boards/:boardId/tasks/:taskId/comments`
- `DELETE /api/boards/:boardId/tasks/:taskId/comments/:commentId/reactions/:emoji`
- `PUT /api/boards/:boardId/tasks/:taskId/comments/:commentId/reactions/:emoji`
- `GET /api/boards/:boardId/tasks/:taskId/description`
- `DELETE /api/boards/:boardId/tasks/:taskId/follow`
- `GET /api/boards/:boardId/tasks/:taskId/follow`
- `PUT /api/boards/:boardId/tasks/:taskId/follow`
- `GET /api/boards/:boardId/tasks/:taskId/history`
- `GET /api/boards/:boardId/tasks/:taskId/reminders`
- `POST /api/boards/:boardId/tasks/:taskId/reminders`
- `DELETE /api/boards/:boardId/tasks/:taskId/reminders/:reminderId`
- `GET /api/boards/:boardId/trash`

## Editors of the board

- `POST /api/boards/:boardId/labels`
- `PATCH /api/boards/:boardId/labels/:labelId`
- `POST /api/boards/:boardId/tasks`
- `DELETE /api/boards/:boardId/tasks/:taskId`
- `PATCH /api/boards/:boardId/tasks/:taskId`
- `POST /api/boards/:boardId/tasks/:taskId/archive`
- `PUT /api/boards/:boardId/tasks/:taskId/assignees`
- `POST /api/boards/:boardId/tasks/:taskId/complete`
- `PUT /api/boards/:boardId/tasks/:taskId/description`
- `PUT /api/boards/:boardId/tasks/:taskId/labels`
- `POST /api/boards/:boardId/tasks/:taskId/move`
- `POST /api/boards/:boardId/tasks/:taskId/restore`
- `POST /api/boards/:boardId/tasks/:taskId/transfer`
- `POST /api/boards/:boardId/tasks/:taskId/transfer/preview`

## Admins of the board

- `PATCH /api/boards/:boardId`
- `POST /api/boards/:boardId/archive`
- `PUT /api/boards/:boardId/default-layout`
- `POST /api/boards/:boardId/invites`, refused on a managed project
- `DELETE /api/boards/:boardId/invites/:inviteId`, refused on a managed project
- `DELETE /api/boards/:boardId/members/:userId`, refused on a managed project
- `PUT /api/boards/:boardId/members/:userId`, refused on a managed project
- `POST /api/boards/:boardId/move`
- `POST /api/boards/:boardId/sections`
- `DELETE /api/boards/:boardId/sections/:sectionId`
- `PATCH /api/boards/:boardId/sections/:sectionId`
- `POST /api/boards/:boardId/sections/:sectionId/move`
- `GET /api/boards/:boardId/sharing`, refused on a managed project
- `GET /api/boards/:boardId/sharing/people`, refused on a managed project
- `POST /api/boards/:boardId/unarchive`
