import type { BoardSummary } from './board'

/**
 * The boards in one list: the favorites first, then the others, the personal
 * ones leading each, the inbox first, the rest by name.
 */
export function listBoards(boards: BoardSummary[]): BoardSummary[] {
  return [...boards].sort(
    (a, b) =>
      Number(b.favorite) - Number(a.favorite) ||
      Number(b.project.personal) - Number(a.project.personal) ||
      Number(b.inbox) - Number(a.inbox) ||
      a.name.localeCompare(b.name)
  )
}
