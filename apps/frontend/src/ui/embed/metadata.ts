import type { Metadata, TwakeSpaceConnection } from '@linagora/twake-embed'
import { useEffect, useRef } from 'react'

import type { Project, ProjectUnread } from '@/application/boards'
import type { BoardSummary, ProjectSummary } from '@/domain/board'
import { useBoards, useProjects, useUnreadByProject } from '@/ui/boards/queries'

// What TwakeSpace accepts in one snapshot
const MAX_ENTRIES = 1000
const MAX_VALUE = 1_000_000

const bounded = (value: number) =>
  Math.min(Math.max(Math.trunc(value), 0), MAX_VALUE)

export interface TaskCounts {
  done: number
  total: number
}

type CountedBoard = Pick<
  BoardSummary,
  'archived' | 'doneTasks' | 'totalTasks'
> & { project: Pick<ProjectSummary, 'id'> }

/** The top-level tasks of each project, summed over its active boards. */
export function countTasks(
  boards: readonly CountedBoard[]
): Map<string, TaskCounts> {
  const counts = new Map<string, TaskCounts>()
  for (const board of boards) {
    if (board.archived) continue
    const sum = counts.get(board.project.id) ?? { done: 0, total: 0 }
    sum.done += board.doneTasks
    sum.total += board.totalTasks
    counts.set(board.project.id, sum)
  }
  return counts
}

/**
 * The metadata of every project of the person, keyed by project id: its
 * unread notifications (`badge`), and once the boards are known, its tasks
 * done out of those not canceled (`tasks.done`, `tasks.total`).
 */
export function computeMetadata(
  projects: readonly Pick<Project, 'id'>[],
  unread: readonly ProjectUnread[],
  boards: readonly CountedBoard[] | null
): Metadata[] {
  const unreadCounts = new Map(
    unread.map(({ projectId, count }) => [projectId, bounded(count)])
  )
  const tasks = boards && countTasks(boards)
  const perProject = projects.map(({ id }): Metadata[] => {
    const badge = unreadCounts.get(id) ?? 0
    const entries = [{ resourceId: id, name: 'badge', value: badge }]
    if (!tasks) return entries
    const { done, total } = tasks.get(id) ?? { done: 0, total: 0 }
    return [
      ...entries,
      { resourceId: id, name: 'tasks.done', value: bounded(done) },
      { resourceId: id, name: 'tasks.total', value: bounded(total) }
    ]
  })
  const size = tasks ? 3 : 1
  if (perProject.length * size <= MAX_ENTRIES) return perProject.flat()
  // Past the cap, the projects with a count on their tab come first
  const unreadFirst = [
    ...perProject.filter(([badge]) => badge?.value !== 0),
    ...perProject.filter(([badge]) => badge?.value === 0)
  ]
  return unreadFirst.slice(0, Math.floor(MAX_ENTRIES / size)).flat()
}

/**
 * Tells TwakeSpace what Tasks knows of every project of the person, whichever
 * one the frame shows. Nothing is sent while the projects or their unread
 * notifications load or cannot be loaded, and a snapshot is sent again only
 * when it changes.
 */
export function useReportMetadata(space: TwakeSpaceConnection): void {
  const projects = useProjects({ poll: true })
  const unread = useUnreadByProject()
  const boards = useBoards({ poll: true })
  const sent = useRef<string | null>(null)

  // An error keeps the last data: it is not reported again
  const projectList = projects.isSuccess ? projects.data : null
  const unreadList = unread.isSuccess ? unread.data : null
  const boardList = boards.data ?? null

  useEffect(() => {
    if (!projectList || !unreadList) return
    const metadata = computeMetadata(projectList, unreadList, boardList)
    const snapshot = JSON.stringify(metadata)
    if (snapshot === sent.current) return
    sent.current = snapshot
    space.reportMetadata(metadata)
  }, [space, projectList, unreadList, boardList])
}
