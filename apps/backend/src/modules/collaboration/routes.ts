import {
  newComment,
  reactionEmoji,
  reactionParams,
  taskParams
} from '@twake-tasks/api-contract'
import type { FastifyRequest } from 'fastify'
import type { Db } from '../../infra/db.ts'
import type { HttpServer } from '../../infra/http.ts'
import {
  defineRoute,
  registerRoutes,
  type DeclaredRoute
} from '../../infra/route.ts'
import type { Identity, RequireIdentity } from '../auth/index.ts'
import { REFUSAL_STATUS } from '../../refusalStatus.ts'
import { under, type Refusal } from '../kernel/index.ts'
import { createCommentStore } from './comments.ts'
import { createFollowerStore } from './followers.ts'

type CollaborationRoute = DeclaredRoute<Identity, Refusal | 'invalid_request'>

const viewer = { on: 'board', role: 'viewer' } as const

export function registerCollaboration(
  app: HttpServer,
  deps: {
    db: Db
    requireIdentity: RequireIdentity
    // 0 for no cap.
    mentionsPerComment: number
  }
): CollaborationRoute[] {
  const commentStore = createCommentStore(deps.db, deps.mentionsPerComment)
  const followerStore = createFollowerStore(deps.db)
  const routes: CollaborationRoute[] = [
    defineRoute({
      method: 'GET',
      url: '/boards/:boardId/tasks/:taskId/follow',
      access: viewer,
      params: taskParams,
      handler: ({ identity, params }) =>
        under(
          'following',
          followerStore.following(identity, params.boardId, params.taskId)
        )
    }),
    ...(
      [
        ['PUT', true],
        ['DELETE', false]
      ] as const
    ).map(([method, following]): CollaborationRoute =>
      defineRoute({
        method,
        url: '/boards/:boardId/tasks/:taskId/follow',
        access: viewer,
        params: taskParams,
        status: 204,
        handler: ({ identity, params }) =>
          followerStore.setFollowing(
            identity,
            params.boardId,
            params.taskId,
            following
          )
      })
    ),
    defineRoute({
      method: 'GET',
      url: '/boards/:boardId/tasks/:taskId/comments',
      access: viewer,
      params: taskParams,
      handler: ({ identity, params }) =>
        under(
          'comments',
          commentStore.listComments(identity, params.boardId, params.taskId)
        )
    }),
    defineRoute({
      method: 'POST',
      url: '/boards/:boardId/tasks/:taskId/comments',
      access: viewer,
      params: taskParams,
      body: newComment,
      status: 201,
      handler: ({ identity, params, body }) =>
        commentStore.addComment(
          identity,
          params.boardId,
          params.taskId,
          body.body
        )
    }),
    ...(['PUT', 'DELETE'] as const).map((method): CollaborationRoute =>
      defineRoute({
        method,
        url: '/boards/:boardId/tasks/:taskId/comments/:commentId/reactions/:emoji',
        access: viewer,
        params: reactionParams,
        status: 204,
        handler: async ({ identity, params }) => {
          const emoji = reactionEmoji.safeParse(params.emoji)
          if (!emoji.success) return { ok: false, error: 'invalid_request' }
          const { boardId, taskId, commentId } = params
          const args = [
            identity,
            boardId,
            taskId,
            commentId,
            emoji.data
          ] as const
          return method === 'PUT'
            ? commentStore.addReaction(...args)
            : commentStore.removeReaction(...args)
        }
      })
    )
  ]
  registerRoutes(
    app,
    {
      requireIdentity: deps.requireIdentity,
      identify: (request: FastifyRequest) => request.identity,
      refusalStatus: REFUSAL_STATUS
    },
    routes
  )
  return routes
}
