import { desc, eq } from 'drizzle-orm'
import type { Db } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { roleOn } from './access.ts'
import { taskHistory } from './schema.ts'
import { Refused, taskOf, writeOrRefuse } from './tasks.ts'

export function historyOf(
  db: Db,
  identity: Identity,
  boardId: string,
  taskId: string
) {
  return writeOrRefuse(db, identity, async tx => {
    if (!(await roleOn(tx, identity.userId, boardId))) {
      throw new Refused('not_found')
    }
    await taskOf(tx, boardId, taskId)
    const rows = await tx
      .select()
      .from(taskHistory)
      .where(eq(taskHistory.taskId, taskId))
      .orderBy(desc(taskHistory.at), desc(taskHistory.id))
    return rows.map(row => ({
      actor: { userId: row.actorId, email: row.actorEmail },
      field: row.field,
      from: row.from,
      to: row.to,
      at: row.at
    }))
  })
}
