import { CrossSmall, Warning } from '@linagora/twake-icons'
import { Box, IconButton, Typography } from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

import { Icon } from '@/ds/Icon'

/** A property value made of groups of tasks, then a line to add one. */
export function TaskLinks({
  label,
  children
}: {
  label: string
  children: ReactNode
}): ReactElement {
  return (
    <Box
      component="section"
      aria-label={label}
      sx={{ width: '100%', display: 'grid', gap: 1, py: 0.5 }}
    >
      {children}
    </Box>
  )
}

export function TaskLinkGroup({
  label,
  notes,
  children
}: {
  label: string
  /** Lines about the group, under its tasks. */
  notes?: ReactNode
  children: ReactNode
}): ReactElement {
  return (
    <div>
      <Typography variant="caption" color="textSecondary" component="h3">
        {label}
      </Typography>
      <Box
        component="ul"
        aria-label={label}
        sx={{ listStyle: 'none', m: 0, p: 0 }}
      >
        {children}
      </Box>
      {notes}
    </div>
  )
}

/** `taskKey` is null for a task the person cannot open, named by `title`. */
export function TaskLinkItem({
  taskKey,
  title,
  where,
  done,
  remove
}: {
  taskKey: string | null
  title: ReactNode
  where: string
  done: boolean
  remove: { label: string; disabled: boolean; onClick: () => void } | undefined
}): ReactElement {
  return (
    <Box
      component="li"
      sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 32 }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          variant="body2"
          className="u-ellipsis"
          color={taskKey ? 'textPrimary' : 'textSecondary'}
          sx={{ textDecoration: done ? 'line-through' : 'none' }}
        >
          {taskKey && (
            <Typography component="span" variant="body2" color="textSecondary">
              {`${taskKey} `}
            </Typography>
          )}
          {title}
        </Typography>
        {where && (
          <Typography
            variant="caption"
            color="textSecondary"
            className="u-ellipsis"
            component="p"
          >
            {where}
          </Typography>
        )}
      </Box>
      {remove && (
        <IconButton
          size="small"
          aria-label={remove.label}
          title={remove.label}
          disabled={remove.disabled}
          onClick={remove.onClick}
        >
          <Icon icon={CrossSmall} size={12} />
        </IconButton>
      )}
    </Box>
  )
}

export function TaskLinkWarning({
  children
}: {
  children: ReactNode
}): ReactElement {
  return (
    <Typography
      variant="caption"
      color="warning"
      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
    >
      <Icon icon={Warning} size={12} />
      {children}
    </Typography>
  )
}
