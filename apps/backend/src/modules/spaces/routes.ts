import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { inTenant, type Db } from '../../infra/db.ts'
import type { HttpServer } from '../../infra/http.ts'
import type { RequireIdentity } from '../auth/index.ts'
import { projectMembers, projects } from '../boards/schema.ts'
import { spaces } from './schema.ts'

const spaceParams = z.object({ spaceId: z.uuid() })

export function registerSpaces(
  app: HttpServer,
  deps: { db: Db; requireIdentity: RequireIdentity }
) {
  app.get(
    '/spaces/:spaceId/project',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = spaceParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const [project] = await inTenant(deps.db, identity, tx =>
        tx
          .select({ id: projects.id })
          .from(spaces)
          .innerJoin(
            projects,
            and(eq(projects.id, spaces.projectId), isNull(projects.deletedAt))
          )
          .innerJoin(
            projectMembers,
            and(
              eq(projectMembers.projectId, projects.id),
              eq(projectMembers.userId, identity.userId)
            )
          )
          .where(eq(spaces.id, params.data.spaceId))
      )
      if (!project) return reply.code(404).send({ error: 'not_found' })
      return project
    }
  )
}
