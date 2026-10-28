import {
  keepPreviousData,
  skipToken,
  useQuery,
  type UseQueryResult
} from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { type Sharing } from '@/application/boards'
import { type Person } from '@/domain/board'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { keys } from '@/ui/queries/keys'

export function usePeople(): UseQueryResult<Person[]> {
  const api = useBoardsApi()
  return useQuery({ queryKey: keys.people(), queryFn: () => api.people() })
}

export function useSharing(
  boardId: string,
  enabled = true
): UseQueryResult<Sharing> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.sharing(boardId),
    queryFn: () => api.getSharing(boardId),
    enabled
  })
}

const SUGGEST_DELAY_MS = 250

export function usePeopleSuggestions(
  boardId: string,
  query: string
): UseQueryResult<Person[]> {
  const api = useBoardsApi()
  const [settled, setSettled] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(query.trim())
    }, SUGGEST_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [query])
  const term = query.trim().length >= 2 && settled.length >= 2 ? settled : ''
  return useQuery({
    queryKey: keys.peopleSuggestions(boardId, term),
    queryFn: term ? () => api.suggestPeople(boardId, term) : skipToken,
    ...(term && { placeholderData: keepPreviousData })
  })
}
