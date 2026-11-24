import type { Db } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { looksOn } from '../boards/index.ts'
import { writeOrRefuse } from '../kernel/index.ts'
import {
  historyEntries,
  linksOf,
  remindersOf,
  visibleTask
} from '../tasks/index.ts'
import { commentsOf } from './comments.ts'
import { follows } from './followers.ts'

// What the task panel opens with, in one transaction and one access check.
export function taskDetails(
  db: Db,
  identity: Identity,
  boardId: string,
  taskId: string
) {
  return writeOrRefuse(db, identity, async tx => {
    const task = await visibleTask(tx, identity, boardId, taskId)
    const looksOf = await looksOn(tx, boardId)
    return {
      description: {
        markdown: task.description,
        version: task.descriptionVersion
      },
      comments: await commentsOf(tx, taskId, looksOf),
      history: await historyEntries(tx, taskId, looksOf),
      links: await linksOf(tx, identity.userId, taskId),
      reminders: await remindersOf(tx, identity.userId, taskId),
      following: await follows(tx, identity.userId, taskId)
    }
  })
}
