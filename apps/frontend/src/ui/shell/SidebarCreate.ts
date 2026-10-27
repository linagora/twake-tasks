import { createContext, useContext, useEffect } from 'react'

import type { FilterCriteria } from '@/application/boards'

/**
 * Whether the app frame offers Create task, in its sidebar or, on phones, its
 * header: the pages it shows then have no button of their own, unlike those
 * Twake Space shows bare.
 */
export const SidebarCreateContext = createContext(false)

export const useSidebarCreate = (): boolean => useContext(SidebarCreateContext)

/**
 * Tells the app frame the criteria of the view it shows, which the tasks of
 * its Create task take so that the view shows them.
 */
export const ViewCriteriaContext = createContext<
  (criteria: FilterCriteria | null) => void
>(() => undefined)

export function useViewCriteria(criteria: FilterCriteria): void {
  const setCriteria = useContext(ViewCriteriaContext)
  // By value: a page may make its criteria anew at each render.
  const value = JSON.stringify(criteria)
  useEffect(() => {
    setCriteria(JSON.parse(value) as FilterCriteria)
    return () => {
      setCriteria(null)
    }
  }, [setCriteria, value])
}
