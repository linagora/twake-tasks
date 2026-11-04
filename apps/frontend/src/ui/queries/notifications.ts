import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'

import {
  type Notification,
  type NotificationPreferences,
  type ProjectUnread
} from '@/application/boards'
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

function useChangeNotifications<T>(
  change: (value: T) => Promise<void>
): UseMutationResult<void, Error, T> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (value: T) => change(value),
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
  return useChangeNotifications(api.markNotificationRead)
}

export function useMarkNotificationsRead(): UseMutationResult<
  void,
  Error,
  string[]
> {
  const api = useBoardsApi()
  return useChangeNotifications(api.markNotificationsRead)
}

export function useRemoveNotification(): UseMutationResult<
  void,
  Error,
  string
> {
  const api = useBoardsApi()
  return useChangeNotifications(api.removeNotification)
}

export function useNotificationPreferences(): UseQueryResult<NotificationPreferences> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.notificationPreferences(),
    queryFn: api.notificationPreferences
  })
}

// Shown at once, and put back when the save fails. While a later save is on
// its way, an earlier one's answer would undo it, so only the last one lands.
export function useKeepNotificationPreferences(): UseMutationResult<
  NotificationPreferences,
  Error,
  NotificationPreferences,
  { before: NotificationPreferences | undefined }
> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  const key = keys.notificationPreferences()
  const last = () => queryClient.isMutating({ mutationKey: key }) === 1
  return useMutation({
    mutationKey: key,
    mutationFn: preferences => api.keepNotificationPreferences(preferences),
    onMutate: async preferences => {
      await queryClient.cancelQueries({ queryKey: key })
      const before = queryClient.getQueryData<NotificationPreferences>(key)
      queryClient.setQueryData(key, preferences)
      return { before }
    },
    onError: (_error, _preferences, context) => {
      if (last()) queryClient.setQueryData(key, context?.before)
    },
    onSuccess: kept => {
      if (last()) queryClient.setQueryData(key, kept)
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
