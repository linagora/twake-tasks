import {
  MutationCache,
  QueryClient,
  type QueryFilters
} from '@tanstack/react-query'

import { ApiError } from '@/application/boards'
import { keys } from '@/ui/queries/keys'

const MAX_QUERY_RETRIES = 2

function httpStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return null
  }
  return typeof error.status === 'number' ? error.status : null
}

export function shouldRetryQuery(
  failureCount: number,
  error: unknown
): boolean {
  const status = httpStatus(error)
  if (status !== null && status >= 400 && status < 500) return false
  if (error instanceof ApiError && error.code === 'timeout') return false
  return failureCount < MAX_QUERY_RETRIES
}

export function makeQueryClient(): QueryClient {
  const markListsStale = () => {
    const allLists: QueryFilters[] = [
      { queryKey: keys.boards(), exact: true },
      { queryKey: keys.agendas() }
    ]
    for (const lists of allLists) {
      void queryClient.invalidateQueries({ ...lists, refetchType: 'none' })
      // A read in flight may predate the write, and its answer would clear
      // the stale mark; read again instead.
      void queryClient.refetchQueries({ ...lists, fetchStatus: 'fetching' })
    }
  }
  const queryClient: QueryClient = new QueryClient({
    mutationCache: new MutationCache({
      onSuccess: markListsStale,
      onError: markListsStale
    }),
    defaultOptions: {
      queries: { retry: shouldRetryQuery, refetchOnWindowFocus: false },
      mutations: { retry: false }
    }
  })
  return queryClient
}
