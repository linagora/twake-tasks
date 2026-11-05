import {
  useQuery,
  useQueryClient,
  type UseQueryResult
} from '@tanstack/react-query'

import { type Agenda } from '@/application/boards'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { localToday, localZone } from '@/ui/boards/dueLabel'
import { keys, type AgendaView } from '@/ui/queries/keys'

export type { AgendaView }

export const UPCOMING_SPANS = [7, 14, 30] as const
export type UpcomingSpan = (typeof UPCOMING_SPANS)[number]

// The lists span many boards, while a change only refreshes its own board.
export function useRefreshLists(): () => void {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: keys.agendas() })
    void queryClient.invalidateQueries({ queryKey: keys.searches() })
  }
}

export function useAgenda(
  view: AgendaView,
  span: UpcomingSpan = UPCOMING_SPANS[0]
): UseQueryResult<Agenda> {
  const api = useBoardsApi()
  return useQuery({
    queryKey:
      view === 'upcoming' ? [...keys.agenda(view), span] : keys.agenda(view),
    // A new span keeps the previous list on screen while it loads, but
    // another view never shows the list of the one before.
    placeholderData: (previous, query) =>
      view === 'upcoming' && query?.queryKey[1] === 'upcoming'
        ? previous
        : undefined,
    queryFn: async () => {
      if (typeof view === 'object') {
        return {
          today: localToday(),
          tasks: await api.filteredTasks(view.filterId, localZone())
        }
      }
      return view === 'mine'
        ? { today: localToday(), tasks: await api.myTasks() }
        : api.agenda(localZone(), view === 'today' ? 1 : span)
    }
  })
}
