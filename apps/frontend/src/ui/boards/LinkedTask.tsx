import { useAlert } from '@linagora/twake-mui'
import { useEffect, useState, type ReactElement } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { type Board } from '@/domain/board'
import { useHiddenTasks } from '@/ui/queries/boards'
import { LinkedTaskPanel } from '@/ui/boards/TaskPanel'
import { lineage } from '@/ui/boards/useTaskPanel'
import { useI18n } from '@/ui/i18n/useI18n'

// A link can name a task the board no longer has, or never had. Each key is
// checked once, on fresh data: a task removed while its panel is open leaves
// its key in the URL for a moment, and a restored one is not in the cache yet.
export function LinkedTask({
  board,
  editable,
  settled
}: {
  board: Board
  editable: boolean
  settled: boolean
}): ReactElement {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const shown = params.get('task')
  const rootKey =
    shown === null ? undefined : lineage(shown, board.tasks).at(-1)
  const root = board.tasks.find(task => task.key === rootKey)
  const [checked, setChecked] = useState<string | null>(null)
  const [lost, setLost] = useState<string | null>(null)

  if (shown !== checked && (shown === null || settled)) {
    setChecked(shown)
    if (shown !== null && !board.tasks.some(task => task.key === shown)) {
      setLost(shown)
    }
  }

  const looking = lost !== null && shown === lost
  const archived = useHiddenTasks(board.id, 'archived', looking)
  const trashed = useHiddenTasks(board.id, 'trash', looking)
  const shelf = archived.data?.some(task => task.key === lost)
    ? 'archived'
    : trashed.data?.some(task => task.key === lost)
      ? 'trash'
      : null
  const searching = archived.isFetching || trashed.isFetching
  const navigate = useNavigate()

  // Twake's alert says the task is gone, as other apps say theirs.
  const { showAlert } = useAlert()
  const full = params.get('panel') === 'full' ? '&panel=full' : ''
  useEffect(() => {
    if (!looking || searching) return
    if (shelf) {
      void navigate(`${shelf}?task=${encodeURIComponent(lost)}${full}`, {
        relative: 'path',
        replace: true
      })
      return
    }
    showAlert({
      message: t('board.taskNotFound'),
      severity: 'warning',
      duration: 8000
    })
    setParams(
      current => {
        const next = new URLSearchParams(current)
        next.delete('task')
        next.delete('panel')
        return next
      },
      { replace: true }
    )
  }, [looking, lost, shelf, full, searching, navigate, setParams, showAlert, t])

  return (
    <>
      {root && (
        <LinkedTaskPanel
          key={root.id}
          task={root}
          tasks={board.tasks}
          boardId={board.id}
          editable={editable}
          depth={1}
        />
      )}
    </>
  )
}
