import { Home, Icon, type IconProps } from '@linagora/twake-icons'
import { Breadcrumbs, Link, Typography } from '@linagora/twake-mui'
import { createContext, type ReactElement, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router'

import { CrumbSlot } from '@/ds/CrumbBar'
import { useI18n } from '@/ui/i18n/useI18n'

export interface Crumb {
  to: string
  label: string
  /** Relative to the URL's path, as `../..` from a board. */
  relative?: boolean
}

/** Where a page starts the breadcrumb from: Boards, Today, My tasks… */
export interface Origin extends Crumb {
  icon: IconProps['icon']
}

/** The page a task is opened from, for its breadcrumb to start there. */
export const OriginContext = createContext<Origin | null>(null)

/**
 * The page a task is opened from when it comes after the origin, as a view
 * after Views, a step of its breadcrumb.
 */
export const PageStepContext = createContext<Crumb | null>(null)

/** The board a task is opened in, a step of its breadcrumb. */
export const BoardStepContext = createContext<Crumb | null>(null)

/**
 * Where the tasks opened in a page start their breadcrumb: the page's origin,
 * then the page itself when it comes after it.
 */
export function TasksOrigin({
  origin,
  page,
  children
}: {
  origin: Origin
  page: Crumb | null
  children: ReactNode
}): ReactElement {
  return (
    <OriginContext value={origin}>
      <PageStepContext value={page}>{children}</PageStepContext>
    </OriginContext>
  )
}

export function useBoardsOrigin(): Origin {
  const { t } = useI18n()
  return { icon: Home, label: t('boards.title'), to: '/' }
}

function OriginLabel({ origin }: { origin: Origin }): ReactElement {
  return (
    <>
      <Icon icon={origin.icon} size={16} className="u-mr-half" />
      {origin.label}
    </>
  )
}

/**
 * Where a page or a task sits: the page it starts from, with its icon, the
 * steps between, then the page itself, which is not a link.
 */
export function Crumbs({
  label,
  origin,
  steps = [],
  current
}: {
  label: string
  origin: Origin
  steps?: Crumb[] | undefined
  /** None when the page is the origin itself. */
  current?: string | undefined
}): ReactElement {
  return (
    <Breadcrumbs aria-label={label} className="u-miw-0">
      {current === undefined ? (
        <Typography
          variant="body2"
          color="textPrimary"
          aria-current="page"
          className="u-flex u-flex-items-center"
        >
          <OriginLabel origin={origin} />
        </Typography>
      ) : (
        <Link
          component={RouterLink}
          to={origin.to}
          relative={origin.relative ? 'path' : 'route'}
          color="inherit"
          underline="hover"
          variant="body2"
          className="u-flex u-flex-items-center"
        >
          <OriginLabel origin={origin} />
        </Link>
      )}
      {steps.map(step => (
        <Link
          key={step.to}
          component={RouterLink}
          to={step.to}
          relative={step.relative ? 'path' : 'route'}
          color="inherit"
          underline="hover"
          variant="body2"
        >
          {step.label}
        </Link>
      ))}
      {current !== undefined && (
        <Typography variant="body2" color="textPrimary" aria-current="page">
          {current}
        </Typography>
      )}
    </Breadcrumbs>
  )
}

export function PageCrumbs({
  origin,
  steps,
  current
}: {
  origin: Origin
  steps?: Crumb[] | undefined
  current?: string | undefined
}): ReactElement {
  const { t } = useI18n()
  return (
    <CrumbSlot>
      <Crumbs
        label={t('page.breadcrumb')}
        origin={origin}
        steps={steps}
        current={current}
      />
    </CrumbSlot>
  )
}
