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

const AGENDA_DAYS = { today: 1, upcoming: 7 } as const

// The lists span many boards, while a change only refreshes its own board.
export function useRefreshLists(): () => void {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: keys.agendas() })
    void queryClient.invalidateQueries({ queryKey: keys.searches() })
  }
}

export function useAgenda(view: AgendaView): UseQueryResult<Agenda> {
  const api = useBoardsApi()
  return useQuery({
    queryKey: keys.agenda(view),
    queryFn: async () => {
      if (typeof view === 'object') {
        return {
          today: localToday(),
          tasks: await api.filteredTasks(view.filterId, localZone())
        }
      }
      return view === 'mine'
        ? { today: localToday(), tasks: await api.myTasks() }
        : api.agenda(localZone(), AGENDA_DAYS[view])
    }
  })
}
