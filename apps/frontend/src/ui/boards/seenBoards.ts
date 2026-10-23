import type { BoardSummary } from '@/domain/board'

const KEY = 'twake-tasks:seen-boards'
const NEW_FOR_MS = 7 * 24 * 60 * 60 * 1000

/** When each board was last opened on this device. */
function seenBoards(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<
      string,
      number
    >
  } catch {
    return {}
  }
}

// A board opened over a week ago can no longer be new, so its entry goes.
export function markBoardSeen(boardId: string): void {
  const now = Date.now()
  const seen = Object.fromEntries(
    Object.entries(seenBoards()).filter(([, at]) => now - at < NEW_FOR_MS)
  )
  seen[boardId] = now
  try {
    localStorage.setItem(KEY, JSON.stringify(seen))
  } catch {
    // Private browsing: the board stays marked new on this device.
  }
}

/** Shared with the person within the week, and not opened on this device since. */
export function newlyShared(): (board: BoardSummary) => boolean {
  const seen = seenBoards()
  const now = Date.now()
  return board =>
    board.sharedBy !== null &&
    now - Date.parse(board.joinedAt) < NEW_FOR_MS &&
    !(board.id in seen)
}
