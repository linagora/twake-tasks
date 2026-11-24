import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'

import { type LinkKind, type Links } from '@/application/boards'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { keys } from '@/ui/queries/keys'
import { useTaskPart } from '@/ui/queries/taskDetails'

export function useLinks(
  boardId: string,
  taskId: string
): UseQueryResult<Links> {
  return useTaskPart(boardId, taskId, 'links')
}

// The other task may sit on another board, whose blocked state changes too.
export function useAddLink(
  boardId: string,
  taskId: string
): UseMutationResult<void, Error, { kind: LinkKind; otherId: string }> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, otherId }) =>
      api.addLink(boardId, taskId, kind, otherId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.boards() })
  })
}

export function useRemoveLink(
  boardId: string,
  taskId: string
): UseMutationResult<void, Error, string> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (otherId: string) => api.removeLink(boardId, taskId, otherId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.boards() })
  })
}
