import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import { useEffect } from 'react'

import type {
  Agenda,
  AgendaTask,
  BoardsApi,
  Comment,
  Description,
  HiddenTask,
  HistoryEntry,
  NewBoard,
  NewReminder,
  NewTask,
  Notification,
  Project,
  ProjectUnread,
  Reminder,
  SavedFilter,
  Sharing,
  Shelf,
  TaskMove,
  TransferPreview
} from '@/application/boards'
import type { Board, BoardSummary, Layout } from '@/domain/board'
import { applyMove } from '@/application/moveTask'
import { findBoard, quickAdd } from '@/application/quickAdd'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { localToday, localZone } from '@/ui/boards/dueLabel'

const POLL_MS = 60_000

const boardsKey = ['boards'] as const
const boardKey = (boardId: string) => ['boards', boardId] as const

export type AgendaView = 'today' | 'upcoming' | 'mine' | { filterId: string }

const AGENDA_DAYS = { today: 1, upcoming: 7 } as const

export function useAgenda(view: AgendaView): UseQueryResult<Agenda> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: ['agenda', view],
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

// A task in a section is done by being in its board's completed section,
// which the agenda does not carry, so the board is read first.
export function useCompleteAgendaTask(): UseMutationResult<
  void,
  Error,
  AgendaTask
> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async task => {
      if (task.sectionId === null) {
        await api.completeTask(task.boardId, task.id, 'completed')
        return
      }
      const board = await queryClient.query({
        queryKey: boardKey(task.boardId),
        queryFn: () => api.getBoard(task.boardId)
      })
      const done = board.sections.find(
        section => section.category === 'completed'
      )
      if (!done) throw new Error('The board has no completed section')
      await api.moveTask(task.boardId, task.id, { sectionId: done.id })
    },
    onSettled: (_data, _error, task) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['agenda'] }),
        queryClient.invalidateQueries({ queryKey: ['search'] }),
        queryClient.invalidateQueries({ queryKey: boardKey(task.boardId) })
      ])
  })
}

export function useSearch(text: string): UseQueryResult<AgendaTask[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: ['search', text],
    queryFn: () => api.search(text),
    enabled: text.trim() !== ''
  })
}

const filtersKey = ['filters'] as const

export function useFilters(): UseQueryResult<SavedFilter[]> {
  const api = useBoardsApi()
  return useQuery({ queryKey: filtersKey, queryFn: () => api.listFilters() })
}

export function useLabelNames(): UseQueryResult<string[]> {
  const api = useBoardsApi()
  return useQuery({ queryKey: ['labels'], queryFn: () => api.labelNames() })
}

export function useCreateFilter(): UseMutationResult<
  { id: string },
  Error,
  Omit<SavedFilter, 'id'>
> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (filter: Omit<SavedFilter, 'id'>) => api.createFilter(filter),
    onSettled: () => queryClient.invalidateQueries({ queryKey: filtersKey })
  })
}

export function useDeleteFilter(): UseMutationResult<void, Error, string> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (filterId: string) => api.deleteFilter(filterId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: filtersKey })
  })
}

export function useSharing(boardId: string): UseQueryResult<Sharing> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: [...boardKey(boardId), 'sharing'],
    queryFn: () => api.getSharing(boardId)
  })
}

export function useHiddenTasks(
  boardId: string,
  shelf: Shelf
): UseQueryResult<HiddenTask[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: [...boardKey(boardId), shelf],
    queryFn: () => api.hiddenTasks(boardId, shelf)
  })
}

// `poll` follows the projects joined or left elsewhere.
export function useProjects({
  poll = false
}: { poll?: boolean } = {}): UseQueryResult<Project[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => api.listProjects(),
    refetchInterval: poll ? POLL_MS : false
  })
}

export function useBoards(): UseQueryResult<BoardSummary[]> {
  const api = useBoardsApi()
  return useQuery({ queryKey: boardsKey, queryFn: () => api.listBoards() })
}

// Reloads on a newer version: a change made elsewhere, or one missed while
// the stream was reconnecting.
export function useBoard(boardId: string): UseQueryResult<Board> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  useEffect(
    () =>
      api.watchBoard(boardId, version => {
        const shown = queryClient.getQueryData<Board>(boardKey(boardId))
        if (shown && version > shown.version) {
          void queryClient.invalidateQueries({ queryKey: boardKey(boardId) })
        }
      }),
    [api, boardId, queryClient]
  )
  return useQuery({
    queryKey: boardKey(boardId),
    queryFn: () => api.getBoard(boardId)
  })
}

export function useCreateTask(
  boardId: string
): UseMutationResult<unknown, Error, NewTask> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (task: NewTask) => api.createTask(boardId, task),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: boardKey(boardId) })
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
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: boardKey(boardId) })
  const transfer = useMutation({
    mutationFn: (to: { boardId: string; sectionId: string | null }) =>
      api.transferTask(boardId, taskId, to),
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
      await queryClient.cancelQueries({ queryKey: boardKey(boardId) })
      const shown = queryClient.getQueryData<Board>(boardKey(boardId))
      if (shown) {
        queryClient.setQueryData<Board>(boardKey(boardId), {
          ...shown,
          tasks: applyMove(shown.tasks, taskId, move)
        })
      }
      return { shown }
    },
    onError: (_error, _input, context) => {
      if (context?.shown) {
        queryClient.setQueryData(boardKey(boardId), context.shown)
      }
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: boardKey(boardId) })
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
      queryClient.invalidateQueries({ queryKey: boardKey(boardId) })
  })
}

const descriptionKey = (boardId: string, taskId: string) =>
  ['boards', boardId, 'tasks', taskId, 'description'] as const

export function useDescription(
  boardId: string,
  taskId: string
): UseQueryResult<Description> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: descriptionKey(boardId, taskId),
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
        queryKey: descriptionKey(boardId, taskId)
      })
  })
}

export function useHistory(
  boardId: string,
  taskId: string
): UseQueryResult<HistoryEntry[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: ['boards', boardId, 'tasks', taskId, 'history'],
    queryFn: () => api.listHistory(boardId, taskId)
  })
}

const commentsKey = (boardId: string, taskId: string) =>
  ['boards', boardId, 'tasks', taskId, 'comments'] as const

export function useComments(
  boardId: string,
  taskId: string
): UseQueryResult<Comment[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: commentsKey(boardId, taskId),
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
          queryKey: commentsKey(boardId, taskId)
        }),
        queryClient.invalidateQueries({
          queryKey: boardKey(boardId),
          exact: true
        })
      ])
  })
}

const remindersKey = (boardId: string, taskId: string) =>
  ['boards', boardId, 'tasks', taskId, 'reminders'] as const

export function useReminders(
  boardId: string,
  taskId: string
): UseQueryResult<Reminder[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: remindersKey(boardId, taskId),
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
      queryClient.invalidateQueries({ queryKey: remindersKey(boardId, taskId) })
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
      queryClient.invalidateQueries({ queryKey: remindersKey(boardId, taskId) })
  })
}

const followingKey = (boardId: string, taskId: string) =>
  ['boards', boardId, 'tasks', taskId, 'following'] as const

export function useFollowing(
  boardId: string,
  taskId: string
): UseQueryResult<boolean> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: followingKey(boardId, taskId),
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
        queryKey: followingKey(boardId, taskId)
      })
  })
}

// Opening the list reads them all.
export function useNotifications(): UseQueryResult<Notification[]> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const notifications = await api.listNotifications()
      if (notifications.some(notification => notification.readAt === null)) {
        await api.markNotificationsRead()
        queryClient.setQueryData(unreadKey, 0)
        queryClient.setQueryData(unreadByProjectKey, [])
      }
      return notifications
    }
  })
}

const unreadKey = ['unreadNotifications'] as const

export function useUnreadNotifications(): UseQueryResult<number> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: unreadKey,
    queryFn: async () =>
      (await api.listNotifications()).filter(
        notification => notification.readAt === null
      ).length,
    refetchInterval: POLL_MS
  })
}

const unreadByProjectKey = ['unreadByProject'] as const

export function useUnreadByProject(): UseQueryResult<ProjectUnread[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: unreadByProjectKey,
    queryFn: () => api.unreadByProject(),
    refetchInterval: POLL_MS
  })
}

export function useQuickAdd(): UseMutationResult<
  { boardId: string; key: string },
  Error,
  string
> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (line: string) => quickAdd(api, line, localToday()),
    onSuccess: ({ boardId }) =>
      queryClient.invalidateQueries({ queryKey: boardKey(boardId) })
  })
}

/** The boards quick add can name, and the one the line names so far. */
export function useQuickAddBoard(name: string | undefined): {
  boards: BoardSummary[] | undefined
  summary: BoardSummary | undefined
  board: Board | undefined
} {
  const api = useBoardsApi()
  const boards = useBoards().data
  const summary = boards && findBoard(boards, name)
  const named = useQuery({
    queryKey: boardKey(summary?.id ?? ''),
    queryFn: summary ? () => api.getBoard(summary.id) : skipToken
  })
  return {
    boards: boards?.filter(each => !each.archived),
    summary,
    board: named.data
  }
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
        boardKey(boardId),
        board =>
          board && {
            ...board,
            layout,
            defaultLayout: everyone ? layout : board.defaultLayout
          }
      )
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: boardKey(boardId) })
  })
}

export function useRenameBoard(
  boardId: string
): UseMutationResult<void, Error, string> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.renameBoard(boardId, name),
    // The list of boards and the board itself: every key starts with boardsKey
    onSettled: () => queryClient.invalidateQueries({ queryKey: boardsKey })
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
      queryClient.invalidateQueries({ queryKey: boardsKey, exact: true })
  })
}

export function useCreateBoard(): UseMutationResult<Board, Error, NewBoard> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (board: NewBoard) => api.createBoard(board),
    onSuccess: board => {
      queryClient.setQueryData(boardKey(board.id), board)
      return queryClient.invalidateQueries({ queryKey: boardsKey, exact: true })
    }
  })
}
