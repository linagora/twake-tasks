import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { keys } from '@/ui/queries/keys'

export function useLabelNames(): UseQueryResult<string[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.labels(),
    queryFn: () => api.labelNames()
  })
}
