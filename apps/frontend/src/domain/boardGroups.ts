import type { BoardSummary, ProjectSummary } from './board'

export interface ProjectGroup {
  project: ProjectSummary
  boards: BoardSummary[]
}

export interface BoardGroups {
  starred: BoardSummary[]
  projects: ProjectGroup[]
}

export function groupBoards(boards: BoardSummary[]): BoardGroups {
  const starred: BoardSummary[] = []
  const byProject = new Map<string, ProjectGroup>()
  for (const board of boards) {
    if (board.favorite) {
      starred.push(board)
      continue
    }
    const group = byProject.get(board.project.id)
    if (group) group.boards.push(board)
    else
      byProject.set(board.project.id, {
        project: board.project,
        boards: [board]
      })
  }
  const projects = [...byProject.values()].sort(
    (a, b) =>
      Number(b.project.personal) - Number(a.project.personal) ||
      a.project.name.localeCompare(b.project.name)
  )
  return { starred, projects }
}
