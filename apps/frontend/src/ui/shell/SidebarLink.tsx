import { NavLink } from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'
import { Link as RouterLink, NavLink as RouterNavLink } from 'react-router'

import { SidebarEntry } from '@/ds/AppFrame'

// The router link is the one focusable, named element; the NavLink of
// twake-mui is a div with role button, so it only draws the entry.
export function SidebarLink({
  to,
  active,
  label,
  onClick,
  children
}: {
  to: string
  /** Lit or not whatever the URL says, when the shell knows better. */
  active?: boolean | undefined
  label?: string | undefined
  onClick?: (() => void) | undefined
  children: ReactNode
}): ReactElement {
  const entry = (lit: boolean) => (
    <NavLink selected={lit} role="presentation" tabIndex={-1}>
      {children}
    </NavLink>
  )
  const named = label ? { 'aria-label': label } : {}

  return (
    <SidebarEntry>
      {active === undefined ? (
        <RouterNavLink to={to} onClick={onClick} {...named}>
          {({ isActive }) => entry(isActive)}
        </RouterNavLink>
      ) : (
        <RouterLink
          to={to}
          onClick={onClick}
          aria-current={active ? 'page' : undefined}
          {...named}
        >
          {entry(active)}
        </RouterLink>
      )}
    </SidebarEntry>
  )
}
