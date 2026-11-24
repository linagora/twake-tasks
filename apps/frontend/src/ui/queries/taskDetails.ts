import {
  useQuery,
  useQueryClient,
  type UseQueryResult
} from '@tanstack/react-query'

import type { BoardsApi, TaskDetails } from '@/application/boards'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { LIST_STALE_MS } from '@/ui/queries/boards'
import { keys } from '@/ui/queries/keys'

type Part = keyof TaskDetails

const ownRoute: {
  [P in Part]: (
    api: BoardsApi,
    boardId: string,
    taskId: string
  ) => Promise<TaskDetails[P]>
} = {
  description: (api, boardId, taskId) => api.getDescription(boardId, taskId),
  comments: (api, boardId, taskId) => api.listComments(boardId, taskId),
  history: (api, boardId, taskId) => api.listHistory(boardId, taskId),
  links: (api, boardId, taskId) => api.listLinks(boardId, taskId),
  reminders: (api, boardId, taskId) => api.listReminders(boardId, taskId),
  following: (api, boardId, taskId) => api.following(boardId, taskId)
}

// A part with no data yet joins one read of the whole task, which also fills
// the parts not shown yet; a part read again uses its own route. Writes and
// board changes mark the parts stale, so the stale time only spares the
// History tab and a reopened panel a read of what was just read.
export function useTaskPart<P extends Part>(
  boardId: string,
  taskId: string,
  part: P
): UseQueryResult<TaskDetails[P]> {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  const readAgain = () => ownRoute[part](api, boardId, taskId)
  const pick = (details: TaskDetails) => details[part]
  return useQuery({
    queryKey: keys[part](boardId, taskId),
    queryFn: async ({ queryKey }) => {
      if (queryClient.getQueryData(queryKey) !== undefined) return readAgain()
      const details = await queryClient.query({
        queryKey: keys.taskDetails(boardId, taskId),
        queryFn: async () => {
          const details = await api.getTaskDetails(boardId, taskId)
          for (const name of Object.keys(ownRoute) as Part[]) {
            const other = keys[name](boardId, taskId)
            if (queryClient.getQueryData(other) === undefined) {
              queryClient.setQueryData(other, details[name])
            }
          }
          return details
        },
        gcTime: 0,
        retry: false
      })
      return pick(details)
    },
    staleTime: LIST_STALE_MS
  })
}
