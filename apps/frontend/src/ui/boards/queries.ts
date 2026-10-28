import {
  keepPreviousData,
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import {
  ApiError,
  type Agenda,
  type AgendaTask,
  type BoardsApi,
  type Comment,
  type Description,
  type FilterFields,
  type HiddenTask,
  type HistoryEntry,
  type NewBoard,
  type NewReminder,
  type NewTask,
  type Notification,
  type Project,
  type ProjectUnread,
  type Reminder,
  type SavedFilter,
  type Sharing,
  type Shelf,
  type TaskMove,
  type TransferPreview
} from '@/application/boards'
import {
  isEditable,
  type Board,
  type BoardSummary,
  type Layout,
  type Person
} from '@/domain/board'
import { applyMove } from '@/application/moveTask'
import {
  createTask,
  defaultBoard,
  type NewTaskDraft,
  type StartedTask
} from '@/application/newTask'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { localToday, localZone } from '@/ui/boards/dueLabel'
import { keys, type AgendaView } from '@/ui/queries/keys'

export type { AgendaView }

const POLL_MS = 60_000

const AGENDA_DAYS = { today: 1, upcoming: 7 } as const

// The lists span many boards, while a change only refreshes its own board.
export function useRefreshLists(): () => void {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: keys.agendas() })
    void queryClient.invalidateQueries({ queryKey: keys.searches() })
  }
}

/** The board as last fetched, without fetching it. */
export function useCachedBoard(boardId: string): Board | undefined {
  return useQuery<Board>({ queryKey: keys.board(boardId), queryFn: skipToken })
    .data
}

export function useAgenda(view: AgendaView): UseQueryResult<Agenda> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.agenda(view),
    queryFn: async () => {
      if (typeof view === 'object') {
        return {
          today: localToday(),
          tasks: await api.filteredTasks(view.filterId, localZone())
        }
      }
      return view === 'mine'
        ? { today: localToday(), tasks: await api.myTasks() }
        : api.agenda(localZone(), AGENDA_DAYS[view])
    }
  })
}

export function searchMinLength(): number {
  const length = Number(window.SEARCH_MIN_LENGTH)
  return Number.isInteger(length) && length >= 1 ? length : 2
}

export function useSearch(text: string): UseQueryResult<AgendaTask[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.search(text),
    queryFn: () => api.search(text),
    enabled: text.trim().length >= searchMinLength()
  })
}

export function useFilters(): UseQueryResult<SavedFilter[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.filters(),
    queryFn: () => api.listFilters()
  })
}

export function useLabelNames(): UseQueryResult<string[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.labels(),
    queryFn: () => api.labelNames()
  })
}

export function usePeople(): UseQueryResult<Person[]> {
  const api = useBoardsApi()
  return useQuery({ queryKey: keys.people(), queryFn: () => api.people() })
}

export function useCreateFilter(): UseMutationResult<
  { id: string },
  Error,
  FilterFields
> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (filter: FilterFields) => api.createFilter(filter),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.filters() })
  })
}

export function useSetFilterFavorite(): UseMutationResult<
  void,
  Error,
  { filterId: string; favorite: boolean }
> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ filterId, favorite }) =>
      api.setFilterFavorite(filterId, favorite),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.filters() })
  })
}

export function useUpdateFilter(
  filterId: string
): UseMutationResult<void, Error, FilterFields> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (filter: FilterFields) => api.updateFilter(filterId, filter),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.filters() }),
        queryClient.invalidateQueries({ queryKey: keys.agenda({ filterId }) })
      ])
  })
}

/** Unpins a filter while its deletion can still be undone, or pins it back. */
export function useUnpinDeletedFilter(): (
  filter: SavedFilter,
  deleted: boolean
) => void {
  const queryClient = useQueryClient()
  return (filter, deleted) => {
    queryClient.setQueryData<SavedFilter[]>(keys.filters(), filters =>
      filters?.map(each =>
        each.id === filter.id
          ? { ...each, favorite: !deleted && filter.favorite }
          : each
      )
    )
  }
}

// For a page that is unloading: the request starts synchronously, where a
// mutation would start it after an await. A page restored from the back-forward
// cache then shows the server's list.
export function useDeleteFilterNow(): (filterId: string) => void {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return filterId => {
    void api
      .deleteFilter(filterId)
      .catch(() => undefined)
      .finally(() =>
        queryClient.invalidateQueries({ queryKey: keys.filters() })
      )
    queryClient.setQueryData<SavedFilter[]>(keys.filters(), filters =>
      filters?.filter(filter => filter.id !== filterId)
    )
  }
}

export function useDeleteFilter(): UseMutationResult<void, Error, string> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (filterId: string) => api.deleteFilter(filterId),
    onMutate: async filterId => {
      await queryClient.cancelQueries({ queryKey: keys.filters() })
      queryClient.setQueryData<SavedFilter[]>(keys.filters(), filters =>
        filters?.filter(filter => filter.id !== filterId)
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.filters() })
  })
}

export function useSharing(
  boardId: string,
  enabled = true
): UseQueryResult<Sharing> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.sharing(boardId),
    queryFn: () => api.getSharing(boardId),
    enabled
  })
}

const SUGGEST_DELAY_MS = 250

export function usePeopleSuggestions(
  boardId: string,
  query: string
): UseQueryResult<Person[]> {
  const api = useBoardsApi()
  const [settled, setSettled] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(query.trim())
    }, SUGGEST_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [query])
  const term = query.trim().length >= 2 && settled.length >= 2 ? settled : ''
  return useQuery({
    queryKey: keys.peopleSuggestions(boardId, term),
    queryFn: term ? () => api.suggestPeople(boardId, term) : skipToken,
    ...(term && { placeholderData: keepPreviousData })
  })
}

export function useHiddenTasks(
  boardId: string,
  shelf: Shelf,
  enabled = true
): UseQueryResult<HiddenTask[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.shelf(boardId, shelf),
    queryFn: enabled ? () => api.hiddenTasks(boardId, shelf) : skipToken
  })
}

// `poll` follows the projects joined or left elsewhere.
export function useProjects({
  poll = false
}: { poll?: boolean } = {}): UseQueryResult<Project[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.projects(),
    queryFn: () => api.listProjects(),
    refetchInterval: poll ? POLL_MS : false
  })
}

// `poll` follows the tasks done or added elsewhere.
export function useBoards({
  poll = false
}: { poll?: boolean } = {}): UseQueryResult<BoardSummary[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.boards(),
    queryFn: () => api.listBoards(),
    refetchInterval: poll ? POLL_MS : false
  })
}

/** The board from the boards list already loaded, without subscribing to it. */
export function useListedBoard(boardId: string): BoardSummary | null {
  const queryClient = useQueryClient()
  return (
    queryClient
      .getQueryData<BoardSummary[]>(keys.boards())
      ?.find(board => board.id === boardId) ?? null
  )
}

// Reloads on a newer version: a change made elsewhere, or one missed while
// the stream was reconnecting. Every view of the board watches it and reads
// count against the person's budget, so a read already under way may bring
// the version and is awaited before reading again.
export function useBoard(boardId: string): UseQueryResult<Board> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  useEffect(() => {
    const queryKey = keys.board(boardId)
    let stopped = false
    // Checks again once the read ends: another watcher may have started the
    // next read in the meantime, or cancelled this one for its own.
    const onVersion = (version: number) => {
      if (stopped) return
      const query = queryClient
        .getQueryCache()
        .find<Board>({ queryKey, exact: true })
      const reading =
        query?.state.fetchStatus === 'fetching' ? query.promise : undefined
      if (reading) {
        void reading
          .catch(() => undefined)
          .then(() => {
            onVersion(version)
          })
        return
      }
      const shown = query?.state.data
      if (shown && version > shown.version) {
        void queryClient.invalidateQueries({ queryKey })
      }
    }
    const unwatch = api.watchBoard(boardId, onVersion)
    return () => {
      stopped = true
      unwatch()
    }
  }, [api, boardId, queryClient])
  return useQuery({
    queryKey: keys.board(boardId),
    queryFn: () => api.getBoard(boardId)
  })
}

// A project's frame opens only that project's boards: one of another project
// is refused as if it did not exist.
export function useBoardOf(
  boardId: string,
  projectId: string | undefined
): {
  board: UseQueryResult<Board>
  shown: Board | undefined
  missing: boolean
} {
  const board = useBoard(boardId)
  const foreign =
    projectId !== undefined &&
    board.data !== undefined &&
    board.data.project.id !== projectId
  const missing =
    foreign || (board.error instanceof ApiError && board.error.status === 404)
  return { board, shown: missing ? undefined : board.data, missing }
}

export function useCreateTask(
  boardId: string
): UseMutationResult<unknown, Error, NewTask> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (task: NewTask) => api.createTask(boardId, task),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: keys.board(boardId) })
  })
}

export function usePreviewTransfer(
  boardId: string,
  taskId: string
): UseMutationResult<
  TransferPreview,
  Error,
  { boardId: string; sectionId: string | null }
> {
  const api = useBoardsApi()
  return useMutation({
    mutationFn: to => api.previewTransfer(boardId, taskId, to)
  })
}

/**
 * Unlike the other board changes, a transfer does not refresh the board by
 * itself: the task leaves it, which closes the panel that tells the person what
 * the move dropped. Call `refresh` once they have read it.
 */
export function useTransferTask(
  boardId: string,
  taskId: string
): {
  transfer: UseMutationResult<
    { key: string } & TransferPreview,
    Error,
    { boardId: string; sectionId: string | null }
  >
  refresh: () => Promise<void>
} {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  // Exact: the moved task's comments, reminders and the rest now 404 under the
  // old board, and its panel is still open while it closes.
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: keys.board(boardId),
      exact: true
    })
  // A move that ends after the form is gone has nobody left to refresh.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const transfer = useMutation({
    mutationFn: async (to: { boardId: string; sectionId: string | null }) => {
      const result = await api.transferTask(boardId, taskId, to)
      if (!mounted.current) void refresh()
      return result
    },
    onError: refresh
  })
  return { transfer, refresh }
}

export function useMoveTask(
  boardId: string
): UseMutationResult<void, Error, { taskId: string; move: TaskMove }> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, move }) => api.moveTask(boardId, taskId, move),
    onMutate: async ({ taskId, move }) => {
      await queryClient.cancelQueries({ queryKey: keys.board(boardId) })
      const shown = queryClient.getQueryData<Board>(keys.board(boardId))
      if (shown) {
        queryClient.setQueryData<Board>(keys.board(boardId), {
          ...shown,
          tasks: applyMove(shown.tasks, taskId, move)
        })
      }
      return { shown }
    },
    onError: (_error, _input, context) => {
      if (context?.shown) {
        queryClient.setQueryData(keys.board(boardId), context.shown)
      }
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: keys.board(boardId) })
  })
}

export function useBoardChange<T>(
  boardId: string,
  change: (api: BoardsApi, input: T) => Promise<unknown>
): UseMutationResult<unknown, Error, T> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: T) => change(api, input),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: keys.board(boardId) })
  })
}

export function useDescription(
  boardId: string,
  taskId: string
): UseQueryResult<Description> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.description(boardId, taskId),
    queryFn: () => api.getDescription(boardId, taskId)
  })
}

export function useSetDescription(
  boardId: string,
  taskId: string
): UseMutationResult<{ version: number }, Error, Description> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (edit: Description) =>
      api.setDescription(boardId, taskId, edit),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: keys.description(boardId, taskId)
      })
  })
}

export function useHistory(
  boardId: string,
  taskId: string
): UseQueryResult<HistoryEntry[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.history(boardId, taskId),
    queryFn: () => api.listHistory(boardId, taskId)
  })
}

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

export function useReminders(
  boardId: string,
  taskId: string
): UseQueryResult<Reminder[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.reminders(boardId, taskId),
    queryFn: () => api.listReminders(boardId, taskId)
  })
}

export function useAddReminder(
  boardId: string,
  taskId: string
): UseMutationResult<void, Error, NewReminder> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reminder: NewReminder) =>
      api.addReminder(boardId, taskId, reminder),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: keys.reminders(boardId, taskId)
      })
  })
}

export function useDeleteReminder(
  boardId: string,
  taskId: string
): UseMutationResult<void, Error, string> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reminderId: string) =>
      api.deleteReminder(boardId, taskId, reminderId),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: keys.reminders(boardId, taskId)
      })
  })
}

export function useFollowing(
  boardId: string,
  taskId: string
): UseQueryResult<boolean> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.following(boardId, taskId),
    queryFn: () => api.following(boardId, taskId)
  })
}

export function useSetFollowing(
  boardId: string,
  taskId: string
): UseMutationResult<void, Error, boolean> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (following: boolean) =>
      api.setFollowing(boardId, taskId, following),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: keys.following(boardId, taskId)
      })
  })
}

// Opening the list reads them all.
export function useNotifications(): UseQueryResult<Notification[]> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: keys.notifications(),
    queryFn: async () => {
      const notifications = await api.listNotifications()
      if (notifications.some(notification => notification.readAt === null)) {
        await api.markNotificationsRead()
        queryClient.setQueryData(keys.unreadNotifications(), 0)
        queryClient.setQueryData(keys.unreadByProject(), [])
      }
      return notifications
    }
  })
}

export function useUnreadNotifications(): UseQueryResult<number> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.unreadNotifications(),
    queryFn: async () =>
      (await api.listNotifications()).filter(
        notification => notification.readAt === null
      ).length,
    refetchInterval: POLL_MS
  })
}

export function useUnreadByProject(): UseQueryResult<ProjectUnread[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.unreadByProject(),
    queryFn: () => api.unreadByProject(),
    refetchInterval: POLL_MS
  })
}

export function useNewTask(): UseMutationResult<
  { boardId: string; key: string },
  Error,
  { boardId: string; draft: NewTaskDraft; started?: StartedTask | undefined }
> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ boardId, draft, started }) =>
      createTask(api, boardId, draft, started),
    // Settled, not succeeded: the task exists once its first request is done,
    // even if adding its details fails. The boards list holds the counts.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.agendas() }),
        queryClient.invalidateQueries({ queryKey: keys.searches() }),
        queryClient.invalidateQueries({ queryKey: keys.boards() })
      ])
  })
}

/**
 * The boards a new task can go in, the one it goes in (`picked`, else the
 * default one), and that board's members and labels.
 */
export function useNewTaskBoard(
  picked: string | undefined,
  inBoardId?: string,
  inProjectId?: string
): {
  targets: BoardSummary[] | undefined
  chosen: BoardSummary | undefined
  board: Board | undefined
  boardFailed: boolean
} {
  const api = useBoardsApi()
  const targets = useBoards().data?.filter(
    each =>
      isEditable(each) &&
      (inProjectId === undefined || each.project.id === inProjectId)
  )
  const chosen =
    targets &&
    (targets.find(each => each.id === picked) ??
      defaultBoard(targets, inBoardId))
  const named = useQuery({
    queryKey: keys.board(chosen?.id ?? ''),
    queryFn: chosen ? () => api.getBoard(chosen.id) : skipToken
  })
  return { targets, chosen, board: named.data, boardFailed: named.isError }
}

export function useSetLayout(
  boardId: string
): UseMutationResult<void, Error, { layout: Layout; everyone: boolean }> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ layout, everyone }) =>
      everyone
        ? api.setDefaultLayout(boardId, layout)
        : api.setLayout(boardId, layout),
    onMutate: ({ layout, everyone }) => {
      queryClient.setQueryData<Board>(
        keys.board(boardId),
        board =>
          board && {
            ...board,
            layout,
            defaultLayout: everyone ? layout : board.defaultLayout
          }
      )
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: keys.board(boardId) })
  })
}

export function useRenameBoard(
  boardId: string
): UseMutationResult<void, Error, string> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.renameBoard(boardId, name),
    // The list of boards and the board itself
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.boards() })
  })
}

export function useSetBoardArchived(): UseMutationResult<
  void,
  Error,
  { boardId: string; archived: boolean }
> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ boardId, archived }) =>
      api.setBoardArchived(boardId, archived),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.boards() })
  })
}

export function useSetFavorite(): UseMutationResult<
  void,
  Error,
  { boardId: string; favorite: boolean }
> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ boardId, favorite }) => api.setFavorite(boardId, favorite),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: keys.boards(), exact: true })
  })
}

export function useCreateBoard(): UseMutationResult<Board, Error, NewBoard> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (board: NewBoard) => api.createBoard(board),
    onSuccess: board => {
      queryClient.setQueryData(keys.board(board.id), board)
      return queryClient.invalidateQueries({
        queryKey: keys.boards(),
        exact: true
      })
    }
  })
}
