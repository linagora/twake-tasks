import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { type AgendaTask } from '@/application/boards'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { keys } from '@/ui/queries/keys'

export function searchMinLength(): number {
  const length = Number(window.SEARCH_MIN_LENGTH)
  return Number.isInteger(length) && length >= 1 ? length : 2
}

export function useSearch(text: string): UseQueryResult<AgendaTask[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.search(text),
    queryFn: () => api.search(text),
    enabled: text.trim().length >= searchMinLength()
  })
}
