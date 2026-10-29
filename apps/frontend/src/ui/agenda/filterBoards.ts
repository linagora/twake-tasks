import { listBoards } from '@/domain/boardList'
import { useBoardName } from '@/ui/boards/BoardsScreen'
import { useI18n } from '@/ui/i18n/useI18n'
import { useBoards } from '@/ui/queries/boards'

/**
 * The active boards a filter can keep to, in the sidebar order. `nameOf` is
 * undefined for a board archived or no longer shared, and while loading.
 */
export function useFilterBoards(): {
  loaded: boolean
  options: { value: string; name: string }[]
  nameOf: (boardId: string) => string | undefined
  labelOf: (boardId: string) => string
} {
  const { t } = useI18n()
  const boards = useBoards()
  const boardName = useBoardName()
  const options = listBoards(
    (boards.data ?? []).filter(board => !board.archived)
  ).map(board => ({ value: board.id, name: boardName(board) }))
  const names = new Map(options.map(option => [option.value, option.name]))
  return {
    loaded: boards.isSuccess,
    options,
    nameOf: boardId => names.get(boardId),
    labelOf: boardId =>
      names.get(boardId) ??
      (boards.isSuccess ? t('filters.boardUnavailable') : '…')
  }
}
