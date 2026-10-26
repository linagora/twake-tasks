import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import type { UserSettings } from '@/application/boards'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { keys } from '@/ui/queries/keys'

export function useSettings(): UseQueryResult<UserSettings> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.settings(),
    queryFn: api.settings,
    retry: false,
    staleTime: Infinity,
    // Changed in Twake Workplace, in another tab.
    refetchOnWindowFocus: 'always'
  })
}
