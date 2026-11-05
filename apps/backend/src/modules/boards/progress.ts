import { sql } from 'drizzle-orm'
import { PROGRESS_DAYS } from '@twake-tasks/api-contract'
import type { Db } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { Refused, writeOrRefuse } from '../kernel/index.ts'
import { roleOn } from './access.ts'
import { shift, todayIn } from './recurrence.ts'
import { taskHistory, tasks } from './schema.ts'

const completed = sql`'"completed"'::jsonb`

/**
 * The completions of the board's top-level tasks, by day in `zone`. Each one
 * of a recurring task counts; one undone by the next change of the task's
 * completion (reopened, canceled) does not. Archiving finished work keeps it
 * counted; trashing it does not.
 */
export function completionsOf(
  db: Db,
  identity: Identity,
  boardId: string,
  zone: string
) {
  const since = shift(todayIn(zone), 1 - PROGRESS_DAYS, 'days')
  return writeOrRefuse(db, identity, async tx => {
    if (!(await roleOn(tx, identity.userId, boardId))) {
      throw new Refused('not_found')
    }
    const days = await tx.execute<{ day: string; done: number }>(sql`
      select to_char((${taskHistory.at} at time zone ${zone})::date, 'YYYY-MM-DD') as day,
             count(*)::int as done
      from ${taskHistory}
      join ${tasks} on ${tasks.id} = ${taskHistory.taskId}
      where ${tasks.boardId} = ${boardId}
        and ${tasks.parentId} is null
        and ${tasks.deletedAt} is null
        and ${taskHistory.field} = 'completion'
        and ${taskHistory.to} = ${completed}
        and ${taskHistory.at} >= (${since}::date)::timestamp at time zone ${zone}
        and coalesce((
          select later."to" is not distinct from ${completed}
          from ${taskHistory} later
          where later.task_id = ${taskHistory.taskId}
            and later.field = 'completion'
            and (later.at, later.id) > (${taskHistory.at}, ${taskHistory.id})
          order by later.at, later.id
          limit 1
        ), true)
      group by 1
      order by 1`)
    return { days: [...days] }
  })
}
