import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import type { UserSettings } from '@/application/boards'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'

export function useSettings(): UseQueryResult<UserSettings> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: ['settings'],
    queryFn: api.settings,
    retry: false,
    staleTime: Infinity
  })
}
