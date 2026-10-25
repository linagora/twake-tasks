import { Archive, Icon, Right, type IconProps } from '@linagora/twake-icons'
import { IconButton, Tooltip, Typography } from '@linagora/twake-mui'
import { createContext, type ReactElement, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router'

import { CrumbRow, CrumbSlot, CrumbStep, CrumbTrail } from '@/ds/CrumbBar'
import { CutTooltip } from '@/ds/CutTooltip'
import { HomeIcon } from '@/ds/HomeIcon'
import { PageTitle } from '@/ds/PageHeader'
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
 * The steps of a task's breadcrumb to the page it is opened in: its board,
 * then the board's archived tasks or trash.
 */
export const BoardStepsContext = createContext<Crumb[] | null>(null)

export function useBoardsOrigin(): Origin {
  const { t } = useI18n()
  return { icon: HomeIcon, label: t('boards.title'), to: '/' }
}

export function useArchivesOrigin(): Origin {
  const { t } = useI18n()
  return { icon: Archive, label: t('boards.archives'), to: '/archives' }
}

function Page({
  heading,
  children
}: {
  heading: boolean
  children: ReactNode
}): ReactElement {
  const Title = heading ? PageTitle : Typography
  return (
    <CutTooltip>
      <Title
        variant={heading ? 'h3' : 'body2'}
        component={heading ? 'h1' : 'div'}
        color="textPrimary"
        aria-current="page"
        // Not while renaming, which would cut the field's label.
        noWrap={heading}
      >
        {children}
      </Title>
    </CutTooltip>
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
  current,
  heading = false
}: {
  label: string
  /** None in a peek, which sits beside the page it starts from. */
  origin?: Origin | undefined
  steps?: Crumb[] | undefined
  /** None when the page is the origin itself. */
  current?: ReactNode
  /**
   * The page's title, as Twake Drive's path is: the page is its heading, so
   * that no title repeats it.
   */
  heading?: boolean
}): ReactElement {
  return (
    <CrumbTrail
      aria-label={label}
      className="u-miw-0"
      separator={<Icon icon={Right} size={16} />}
    >
      {origin === undefined ? null : current === undefined ? (
        <Page heading={heading}>{origin.label}</Page>
      ) : (
        // As the root folder in Twake Drive's path: its icon alone.
        <Tooltip title={origin.label}>
          <IconButton
            component={RouterLink}
            to={origin.to}
            relative={origin.relative ? 'path' : 'route'}
            size="small"
            aria-label={origin.label}
            color="inherit"
          >
            <Icon icon={origin.icon} size={16} />
          </IconButton>
        </Tooltip>
      )}
      {steps.map(step => (
        <CutTooltip key={step.to}>
          <CrumbStep
            component={RouterLink}
            to={step.to}
            relative={step.relative ? 'path' : 'route'}
            color="inherit"
            underline="hover"
            variant={heading ? 'h3' : 'body2'}
            noWrap
          >
            {step.label}
          </CrumbStep>
        </CutTooltip>
      ))}
      {current !== undefined && <Page heading={heading}>{current}</Page>}
    </CrumbTrail>
  )
}

export function PageCrumbs({
  origin,
  steps,
  current,
  heading = false,
  actions
}: {
  origin: Origin
  steps?: Crumb[] | undefined
  current?: ReactNode
  /** The breadcrumb is the page's title, with its actions beside it. */
  heading?: boolean
  actions?: ReactNode
}): ReactElement {
  const { t } = useI18n()
  return (
    <CrumbSlot>
      <CrumbRow actions={actions}>
        <Crumbs
          label={t('page.breadcrumb')}
          origin={origin}
          steps={steps}
          current={current}
          heading={heading}
        />
      </CrumbRow>
    </CrumbSlot>
  )
}
