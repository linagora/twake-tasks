import type { Board, BoardSummary, Task } from '@/domain/board'

export interface NewBoard {
  name: string
  keyPrefix: string
}

export interface NewTask {
  sectionId: string | null
  title: string
}

export interface TaskMove {
  sectionId: string | null
  afterId?: string
  beforeId?: string
}

/** Rejects with an ApiError when the backend refuses the request. */
export interface BoardsApi {
  listBoards: () => Promise<BoardSummary[]>
  getBoard: (boardId: string) => Promise<Board>
  createBoard: (board: NewBoard) => Promise<Board>
  createTask: (
    boardId: string,
    task: NewTask
  ) => Promise<Pick<Task, 'id' | 'key' | 'title' | 'sectionId'>>
  moveTask: (boardId: string, taskId: string, move: TaskMove) => Promise<void>
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string | null

  constructor(status: number, code: string | null) {
    super(`API answered ${String(status)}${code ? ` ${code}` : ''}`)
    this.status = status
    this.code = code
  }
}
