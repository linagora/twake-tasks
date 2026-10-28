import {
  useQuery,
  useQueryClient,
  type UseQueryResult
} from '@tanstack/react-query'

import { type Notification, type ProjectUnread } from '@/application/boards'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { POLL_MS } from '@/ui/queries/boards'
import { keys } from '@/ui/queries/keys'

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
