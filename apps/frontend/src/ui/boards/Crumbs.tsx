import { Home, Icon } from '@linagora/twake-icons'
import { Breadcrumbs, Link, Typography } from '@linagora/twake-mui'
import type { ReactElement } from 'react'
import { Link as RouterLink } from 'react-router'

import { useI18n } from '@/ui/i18n/useI18n'

export interface Crumb {
  to: string
  label: string
  /** Relative to the URL's path, as `../..` from a board. */
  relative?: boolean
}

/**
 * Where a page or a task sits: the boards behind a house, the steps between,
 * and the page itself, not a link.
 */
export function Crumbs({
  label,
  home,
  steps = [],
  current
}: {
  label: string
  home: Crumb
  steps?: Crumb[]
  current: string
}): ReactElement {
  return (
    <Breadcrumbs aria-label={label} className="u-miw-0">
      <Link
        component={RouterLink}
        to={home.to}
        relative={home.relative ? 'path' : 'route'}
        color="inherit"
        aria-label={home.label}
        className="u-flex"
      >
        <Icon icon={Home} size={16} />
      </Link>
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
      <Typography variant="body2" color="textPrimary" aria-current="page">
        {current}
      </Typography>
    </Breadcrumbs>
  )
}

/** A board's place: the boards, then the board. */
export function BoardCrumbs({ name }: { name: string }): ReactElement {
  const { t } = useI18n()
  return (
    <Crumbs
      label={t('board.breadcrumb')}
      home={{ to: '../..', label: t('board.back'), relative: true }}
      current={name}
    />
  )
}
