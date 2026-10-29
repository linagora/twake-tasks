import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Db, Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { Refused, writeOrRefuse } from '../kernel/index.ts'
import {
  bumpBoard,
  commentReactions,
  comments,
  looksOn,
  roleOn,
  taskOf
} from '../boards/index.ts'
import {
  mentionedEmails,
  plainText,
  refuseIfShelved,
  visibleTask
} from '../tasks/index.ts'

interface Reactor {
  userId: string
  email: string
}

async function seeBoard(tx: Tx, identity: Identity, boardId: string) {
  if (!(await roleOn(tx, identity.userId, boardId))) {
    throw new Refused('not_found')
  }
}

async function openTask(
  tx: Tx,
  identity: Identity,
  boardId: string,
  taskId: string
) {
  await seeBoard(tx, identity, boardId)
  // Before reading the task, so a concurrent archive cannot slip in between.
  // The bump also has the board's viewers reload the open comments.
  await bumpBoard(tx, boardId)
  const task = await taskOf(tx, boardId, taskId)
  await refuseIfShelved(tx, boardId, task)
  return task
}

async function commentOf(tx: Tx, taskId: string, commentId: string) {
  const [comment] = await tx
    .select({ id: comments.id, organizationId: comments.organizationId })
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.taskId, taskId)))
  if (!comment) throw new Refused('not_found')
  return comment
}

export function createCommentStore(db: Db, mentionsPerComment = 0) {
  return {
    listComments(identity: Identity, boardId: string, taskId: string) {
      return writeOrRefuse(db, identity, async tx => {
        await visibleTask(tx, identity, boardId, taskId)
        const rows = await tx
          .select()
          .from(comments)
          .where(eq(comments.taskId, taskId))
          .orderBy(asc(comments.createdAt), asc(comments.id))
        const looksOf = await looksOn(tx, boardId)
        const reactions =
          rows.length === 0
            ? []
            : await tx
                .select()
                .from(commentReactions)
                .where(
                  inArray(
                    commentReactions.commentId,
                    rows.map(row => row.id)
                  )
                )
                .orderBy(
                  asc(commentReactions.createdAt),
                  asc(commentReactions.userId)
                )
        // Each emoji once per comment, in the order it was first given.
        const byComment = new Map<string, Map<string, Reactor[]>>()
        for (const reaction of reactions) {
          const emojis =
            byComment.get(reaction.commentId) ?? new Map<string, Reactor[]>()
          byComment.set(reaction.commentId, emojis)
          const people = emojis.get(reaction.emoji) ?? []
          emojis.set(reaction.emoji, people)
          people.push({ userId: reaction.userId, email: reaction.userEmail })
        }
        return rows.map(row => ({
          id: row.id,
          author: {
            userId: row.authorId,
            email: row.authorEmail,
            ...looksOf(row.authorId, row.authorName)
          },
          body: row.body,
          createdAt: row.createdAt,
          reactions: [...(byComment.get(row.id) ?? [])].map(
            ([emoji, people]) => ({
              emoji,
              people: people.map(person => ({
                ...person,
                ...looksOf(person.userId)
              }))
            })
          )
        }))
      })
    },

    addComment(
      identity: Identity,
      boardId: string,
      taskId: string,
      body: string
    ) {
      return writeOrRefuse(db, identity, async tx => {
        const task = await openTask(tx, identity, boardId, taskId)
        if (
          mentionsPerComment > 0 &&
          mentionedEmails(body).size > mentionsPerComment
        ) {
          throw new Refused('too_many_mentions')
        }
        const looksOf = await looksOn(tx, boardId)
        const [comment] = await tx
          .insert(comments)
          .values({
            taskId,
            organizationId: task.organizationId,
            authorId: identity.userId,
            authorEmail: identity.email,
            authorName: looksOf(identity.userId).name,
            body,
            bodyText: plainText(body)
          })
          .returning({ id: comments.id, createdAt: comments.createdAt })
        if (!comment) throw new Error('comment insert returned nothing')
        return comment
      })
    },

    addReaction(
      identity: Identity,
      boardId: string,
      taskId: string,
      commentId: string,
      emoji: string
    ) {
      return writeOrRefuse(db, identity, async tx => {
        await openTask(tx, identity, boardId, taskId)
        const comment = await commentOf(tx, taskId, commentId)
        await tx
          .insert(commentReactions)
          .values({
            commentId,
            organizationId: comment.organizationId,
            userId: identity.userId,
            userEmail: identity.email,
            emoji
          })
          .onConflictDoNothing()
      })
    },

    removeReaction(
      identity: Identity,
      boardId: string,
      taskId: string,
      commentId: string,
      emoji: string
    ) {
      return writeOrRefuse(db, identity, async tx => {
        await openTask(tx, identity, boardId, taskId)
        await commentOf(tx, taskId, commentId)
        await tx
          .delete(commentReactions)
          .where(
            and(
              eq(commentReactions.commentId, commentId),
              eq(commentReactions.userId, identity.userId),
              eq(commentReactions.emoji, emoji)
            )
          )
      })
    }
  }
}
