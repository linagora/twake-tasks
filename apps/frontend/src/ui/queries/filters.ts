import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'

import { type FilterFields, type SavedFilter } from '@/application/boards'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { keys } from '@/ui/queries/keys'

export function useFilters(): UseQueryResult<SavedFilter[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.filters(),
    queryFn: () => api.listFilters()
  })
}

export function useCreateFilter(): UseMutationResult<
  { id: string },
  Error,
  FilterFields
> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (filter: FilterFields) => api.createFilter(filter),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.filters() })
  })
}

export function useSetFilterFavorite(): UseMutationResult<
  void,
  Error,
  { filterId: string; favorite: boolean }
> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ filterId, favorite }) =>
      api.setFilterFavorite(filterId, favorite),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.filters() })
  })
}

export function useUpdateFilter(
  filterId: string
): UseMutationResult<void, Error, FilterFields> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (filter: FilterFields) => api.updateFilter(filterId, filter),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.filters() }),
        queryClient.invalidateQueries({ queryKey: keys.agenda({ filterId }) })
      ])
  })
}

/** Unpins a filter while its deletion can still be undone, or pins it back. */
export function useUnpinDeletedFilter(): (
  filter: SavedFilter,
  deleted: boolean
) => void {
  const queryClient = useQueryClient()
  return (filter, deleted) => {
    queryClient.setQueryData<SavedFilter[]>(keys.filters(), filters =>
      filters?.map(each =>
        each.id === filter.id
          ? { ...each, favorite: !deleted && filter.favorite }
          : each
      )
    )
  }
}

// For a page that is unloading: the request starts synchronously, where a
// mutation would start it after an await. A page restored from the back-forward
// cache then shows the server's list.
export function useDeleteFilterNow(): (filterId: string) => void {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return filterId => {
    void api
      .deleteFilter(filterId)
      .catch(() => undefined)
      .finally(() =>
        queryClient.invalidateQueries({ queryKey: keys.filters() })
      )
    queryClient.setQueryData<SavedFilter[]>(keys.filters(), filters =>
      filters?.filter(filter => filter.id !== filterId)
    )
  }
}

export function useDeleteFilter(): UseMutationResult<void, Error, string> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (filterId: string) => api.deleteFilter(filterId),
    onMutate: async filterId => {
      await queryClient.cancelQueries({ queryKey: keys.filters() })
      queryClient.setQueryData<SavedFilter[]>(keys.filters(), filters =>
        filters?.filter(filter => filter.id !== filterId)
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.filters() })
  })
}
