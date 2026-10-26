import { useIsMutating } from '@tanstack/react-query'

import type { Section, Task } from '@/domain/board'
import { useBoardChange, useMoveTask } from '@/ui/boards/queries'

const movesTask = (variables: unknown, taskId: string): boolean =>
  typeof variables === 'object' &&
  variables !== null &&
  'taskId' in variables &&
  variables.taskId === taskId

export interface CompleteToggle {
  done: boolean
  disabled: boolean
  noDoneSection: boolean
  toggle: () => void
}

// A task in a section is done by being in a completed section, so completing
// it moves it there; a task outside sections is completed in place.
export function useCompleteToggle(
  task: Task,
  boardId: string,
  sections: Section[],
  editable: boolean
): CompleteToggle {
  const complete = useBoardChange(boardId, (api, done: boolean) =>
    api.completeTask(boardId, task.id, done ? 'completed' : null)
  )
  const move = useMoveTask(boardId)
  // Not move.isPending: a moved card remounts in its new column with a fresh
  // mutation while the first move is still in flight.
  const moving =
    useIsMutating({
      predicate: mutation => movesTask(mutation.state.variables, task.id)
    }) > 0
  const section = sections.find(each => each.id === task.sectionId)
  const doneSection = sections.find(each => each.category === 'completed')
  const openSection = sections.find(each => each.category === 'unstarted')
  const done = section
    ? section.category === 'completed'
    : task.completedAt !== null
  const target = section && (done ? openSection : doneSection)

  return {
    done,
    disabled:
      !editable ||
      task.canceledAt !== null ||
      (section ? !target || moving : complete.isPending),
    noDoneSection: section !== undefined && doneSection === undefined,
    toggle: () => {
      if (!section) complete.mutate(!done)
      else if (target) {
        move.mutate({ taskId: task.id, move: { sectionId: target.id } })
      }
    }
  }
}
