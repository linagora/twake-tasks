import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'

import { type Comment } from '@/application/boards'
import { type Person } from '@/domain/board'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { keys } from '@/ui/queries/keys'

export function useComments(
  boardId: string,
  taskId: string
): UseQueryResult<Comment[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.comments(boardId, taskId),
    queryFn: () => api.listComments(boardId, taskId)
  })
}

export function useAddComment(
  boardId: string,
  taskId: string
): UseMutationResult<void, Error, string> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => api.addComment(boardId, taskId, body),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: keys.comments(boardId, taskId)
        }),
        queryClient.invalidateQueries({
          queryKey: keys.board(boardId),
          exact: true
        })
      ])
  })
}

export interface ReactionChange {
  commentId: string
  emoji: string
  /** True to add the reaction, false to take it back. */
  on: boolean
}

function computeReactions(
  comments: Comment[],
  { commentId, emoji, on }: ReactionChange,
  me: Person
): Comment[] {
  const isMe = (person: Person) =>
    person.email.toLowerCase() === me.email.toLowerCase()
  return comments.map(comment => {
    if (comment.id !== commentId) return comment
    const given = comment.reactions.some(reaction => reaction.emoji === emoji)
    const reactions = given
      ? comment.reactions.map(reaction =>
          reaction.emoji !== emoji
            ? reaction
            : {
                ...reaction,
                people: on
                  ? reaction.people.some(isMe)
                    ? reaction.people
                    : [...reaction.people, me]
                  : reaction.people.filter(person => !isMe(person))
              }
        )
      : on
        ? [...comment.reactions, { emoji, people: [me] }]
        : comment.reactions
    return {
      ...comment,
      reactions: reactions.filter(reaction => reaction.people.length > 0)
    }
  })
}

/** Shows the change at once, and takes it back if the server refuses it. */
export function useReact(
  boardId: string,
  taskId: string,
  me: Person
): UseMutationResult<
  void,
  Error,
  ReactionChange,
  { before: Comment[] | undefined }
> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  const key = keys.comments(boardId, taskId)
  return useMutation({
    mutationFn: ({ commentId, emoji, on }: ReactionChange) =>
      on
        ? api.addReaction(boardId, taskId, commentId, emoji)
        : api.removeReaction(boardId, taskId, commentId, emoji),
    onMutate: async change => {
      await queryClient.cancelQueries({ queryKey: key })
      const before = queryClient.getQueryData<Comment[]>(key)
      if (before) {
        queryClient.setQueryData(key, computeReactions(before, change, me))
      }
      return { before }
    },
    onError: (_error, _change, context) => {
      if (context?.before) queryClient.setQueryData(key, context.before)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key })
  })
}
