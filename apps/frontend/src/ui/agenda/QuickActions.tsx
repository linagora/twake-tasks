import { CalendarToday, Check, Next } from '@linagora/twake-icons'
import { IconButton, Tooltip, useAlert } from '@linagora/twake-mui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'

import type { AgendaTask } from '@/application/boards'
import { addDays, reschedule } from '@/application/reschedule'
import { isEditable } from '@/domain/board'
import { Icon, type IconProps } from '@/ds/Icon'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { localToday } from '@/ui/boards/dueLabel'
import { useI18n } from '@/ui/i18n/useI18n'
import { useRefreshLists } from '@/ui/queries/agenda'
import { useBoards } from '@/ui/queries/boards'
import { keys } from '@/ui/queries/keys'

class NoDoneSection extends Error {}

type QuickAction = { kind: 'complete' } | { kind: 'due'; day: string }

function useQuickAction(task: AgendaTask) {
  const api = useBoardsApi()
  const queryClient = useQueryClient()
  const refresh = useRefreshLists()
  const { showAlert } = useAlert()
  const { t } = useI18n()
  const { boardId } = task
  return useMutation({
    mutationFn: async (action: QuickAction) => {
      if (action.kind === 'due') {
        return api.editTask(boardId, task.id, reschedule(task, action.day))
      }
      if (task.category === null) {
        return api.completeTask(boardId, task.id, 'completed')
      }
      // A task in a section is done once in a completed section: the board's first.
      const board = await api.getBoard(boardId)
      const done = board.sections.find(each => each.category === 'completed')
      if (!done) throw new NoDoneSection()
      return api.moveTask(boardId, task.id, { sectionId: done.id })
    },
    onSuccess: (_result, action) => {
      if (action.kind !== 'complete' || task.blockers.length === 0) return
      showAlert({
        message: t('dependencies.stillBlocked', {
          key: task.key,
          blockers: task.blockers
            .map(blocker => blocker?.key ?? t('dependencies.hidden'))
            .join(', ')
        }),
        severity: 'warning',
        duration: 8000
      })
    },
    onError: error => {
      showAlert({
        message:
          error instanceof NoDoneSection
            ? t('agenda.noDoneSection', { board: task.boardName })
            : t('agenda.quickFailed'),
        severity: 'error'
      })
    },
    onSettled: () => {
      refresh()
      void queryClient.invalidateQueries({ queryKey: keys.board(boardId) })
    }
  })
}

/** Done, a day later, or today when late, without opening the task. */
export function QuickActions({
  task
}: {
  task: AgendaTask
}): ReactElement | null {
  const { t } = useI18n()
  const summary = useBoards().data?.find(each => each.id === task.boardId)
  const quick = useQuickAction(task)
  if (summary === undefined || !isEditable(summary)) return null
  const today = localToday()
  const button = (
    label: string,
    icon: IconProps['icon'],
    action: QuickAction
  ) => (
    <Tooltip disableInteractive title={label}>
      <IconButton
        size="small"
        aria-label={label}
        onClick={() => {
          if (!quick.isPending) quick.mutate(action)
        }}
      >
        <Icon icon={icon} size={16} />
      </IconButton>
    </Tooltip>
  )
  return (
    <span className="u-flex">
      {task.dueDate !== null &&
        task.dueDate < today &&
        button(t('agenda.toToday'), CalendarToday, { kind: 'due', day: today })}
      {task.dueDate !== null &&
        button(t('agenda.postpone'), Next, {
          kind: 'due',
          day: addDays(task.dueDate, 1)
        })}
      {button(t('agenda.complete'), Check, { kind: 'complete' })}
    </span>
  )
}
