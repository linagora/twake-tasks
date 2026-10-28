import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'

import { type Notification, type ProjectUnread } from '@/application/boards'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { POLL_MS } from '@/ui/queries/boards'
import { keys } from '@/ui/queries/keys'

export function useNotifications(): UseQueryResult<Notification[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.notifications(),
    queryFn: () => api.listNotifications()
  })
}

function useMarkRead<T>(
  read: (value: T) => Promise<void>
): UseMutationResult<void, Error, T> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (value: T) => read(value),
    onSettled: () =>
      Promise.all(
        [
          keys.notifications(),
          keys.unreadNotifications(),
          keys.unreadByProject()
        ].map(queryKey => queryClient.invalidateQueries({ queryKey }))
      )
  })
}

export function useMarkNotificationRead(): UseMutationResult<
  void,
  Error,
  string
> {
  const api = useBoardsApi()
  return useMarkRead(api.markNotificationRead)
}

export function useMarkNotificationsRead(): UseMutationResult<
  void,
  Error,
  string[]
> {
  const api = useBoardsApi()
  return useMarkRead(api.markNotificationsRead)
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
