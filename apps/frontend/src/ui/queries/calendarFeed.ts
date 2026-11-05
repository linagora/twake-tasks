import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'

import type { CalendarFeed, CalendarFeedScope } from '@/application/boards'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { keys } from '@/ui/queries/keys'

export function useCalendarFeed(): UseQueryResult<CalendarFeed | null> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.calendarFeed(),
    queryFn: () => api.calendarFeed()
  })
}

function useFeedChange<T, R extends CalendarFeed | null>(
  change: (variables: T) => Promise<R>
): UseMutationResult<R, Error, T> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: change,
    onSuccess: feed => {
      queryClient.setQueryData(keys.calendarFeed(), feed)
    }
  })
}

export function useOpenCalendarFeed(): UseMutationResult<
  CalendarFeed & { url: string },
  Error,
  CalendarFeedScope
> {
  const api = useBoardsApi()
  return useFeedChange((scope: CalendarFeedScope) =>
    api.openCalendarFeed(scope)
  )
}

export function useChangeCalendarFeed(): UseMutationResult<
  CalendarFeed,
  Error,
  CalendarFeedScope
> {
  const api = useBoardsApi()
  return useFeedChange((scope: CalendarFeedScope) =>
    api.changeCalendarFeed(scope)
  )
}

export function useCloseCalendarFeed(): UseMutationResult<null, Error, void> {
  const api = useBoardsApi()
  return useFeedChange(() => api.closeCalendarFeed().then(() => null))
}
