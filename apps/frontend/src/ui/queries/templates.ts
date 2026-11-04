import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'

import type { TemplateFields } from '@/application/boards'
import type { Template } from '@/domain/board'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { keys } from '@/ui/queries/keys'

export function useTemplates(): UseQueryResult<Template[]> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.templates(),
    queryFn: () => api.listTemplates()
  })
}

export interface TemplateSave {
  /** Left out, a new template. */
  templateId?: string | undefined
  projectId: string
  fields: TemplateFields
}

// A task shows the title of its template, so boards are refreshed too.
function useTemplateChange<T>(
  change: (variables: T) => Promise<unknown>
): UseMutationResult<unknown, Error, T> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: change,
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.templates() }),
        queryClient.invalidateQueries({ queryKey: keys.boards() })
      ])
  })
}

export function useSaveTemplate(): UseMutationResult<
  unknown,
  Error,
  TemplateSave
> {
  const api = useBoardsApi()
  return useTemplateChange(({ templateId, projectId, fields }: TemplateSave) =>
    templateId === undefined
      ? api.createTemplate(projectId, fields)
      : api.editTemplate({ id: templateId, projectId }, fields)
  )
}

export function useDeleteTemplate(): UseMutationResult<
  unknown,
  Error,
  Template
> {
  const api = useBoardsApi()
  return useTemplateChange((template: Template) => api.deleteTemplate(template))
}
