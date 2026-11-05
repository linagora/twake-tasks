import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import type { SectionName } from '@/application/boards'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { keys } from '@/ui/queries/keys'

export function useLabelNames(): UseQueryResult<string[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.labels(),
    queryFn: () => api.labelNames()
  })
}

export function useSectionNames(): UseQueryResult<SectionName[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.sectionNames(),
    queryFn: () => api.sectionNames()
  })
}
