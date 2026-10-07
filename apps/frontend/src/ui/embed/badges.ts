import type { Badge, TwakeSpaceConnection } from '@linagora/twake-embed'
import { useEffect, useRef } from 'react'

import type { Project, ProjectUnread } from '@/application/boards'
import { useProjects, useUnreadByProject } from '@/ui/boards/queries'

// What TwakeSpace accepts in one snapshot
const MAX_BADGES = 1000
const MAX_COUNT = 1_000_000

/**
 * One badge per project of the person, keyed by project id: the unread
 * notifications about it, 0 when there are none. Unread counts of projects the
 * person no longer has are left out.
 */
export function computeBadges(
  projects: readonly Pick<Project, 'id'>[],
  unread: readonly ProjectUnread[]
): Badge[] {
  const counts = new Map(
    unread.map(({ projectId, count }) => [projectId, count])
  )
  const badges = projects.map(({ id }) => ({
    resourceId: id,
    count: Math.min(Math.max(Math.trunc(counts.get(id) ?? 0), 0), MAX_COUNT)
  }))
  if (badges.length <= MAX_BADGES) return badges
  // A missing project shows no badge, as does a count of 0
  return badges.filter(({ count }) => count > 0).slice(0, MAX_BADGES)
}

/**
 * Tells TwakeSpace the badges of its tabs: the unread notifications of every
 * project of the person, whichever one the frame shows. Nothing is sent while
 * they load or when they cannot be loaded, and a snapshot is sent again only
 * when it changes.
 */
export function useReportBadges(space: TwakeSpaceConnection): void {
  const projects = useProjects({ poll: true })
  const unread = useUnreadByProject()
  const sent = useRef<string | null>(null)

  // An error keeps the last data: it is not reported again
  const projectList = projects.isSuccess ? projects.data : null
  const unreadList = unread.isSuccess ? unread.data : null

  useEffect(() => {
    if (!projectList || !unreadList) return
    const badges = computeBadges(projectList, unreadList)
    const snapshot = JSON.stringify(badges)
    if (snapshot === sent.current) return
    sent.current = snapshot
    space.reportBadges(badges)
  }, [space, projectList, unreadList])
}
