import {
  Avatar,
  Chip,
  getInitials,
  IconButton,
  Menu,
  MenuItem,
  nameToColor,
  Typography
} from '@linagora/twake-mui'
import { Dots, Icon } from '@linagora/twake-icons'
import { useState, type ReactElement } from 'react'

import { Card, Row } from '@/ds/Columns'
import type { Section, Task } from '@/domain/board'
import { useI18n } from '@/ui/i18n/useI18n'

const PRIORITY_COLOR = {
  1: 'error',
  2: 'warning',
  3: 'info',
  4: 'default'
} as const

export function TaskCard({
  task,
  destinations,
  onMove
}: {
  task: Task
  destinations: { id: string | null; name: string }[]
  onMove: ((sectionId: Section['id'] | null) => void) | undefined
}): ReactElement {
  const { t, lang } = useI18n()
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const due =
    task.dueDate &&
    new Intl.DateTimeFormat(lang, {
      dateStyle: 'medium',
      timeZone: 'UTC'
    }).format(new Date(task.dueDate))

  return (
    <Card label={`${task.key} ${task.title}`}>
      <Row>
        <Typography variant="caption" color="textSecondary">
          {task.key}
        </Typography>
        {onMove && destinations.length > 0 && (
          <IconButton
            size="small"
            className="u-ml-auto"
            aria-label={t('board.move', { key: task.key })}
            aria-haspopup="menu"
            onClick={event => {
              setMenuAnchor(event.currentTarget)
            }}
          >
            <Icon icon={Dots} />
          </IconButton>
        )}
      </Row>
      <Typography variant="body1">{task.title}</Typography>
      <Row>
        {task.priority !== null && (
          <Chip
            size="small"
            color={PRIORITY_COLOR[task.priority]}
            label={t('board.priority', { level: task.priority })}
          />
        )}
        {due && (
          <Typography variant="caption">
            {t('board.due', { date: due })}
          </Typography>
        )}
        {task.assignees.map((email, index) => (
          <Avatar
            key={email}
            size="xs"
            color={nameToColor(email) ?? 'sunrise'}
            role="img"
            aria-label={t('board.assignee', { name: email })}
            className={index === 0 ? 'u-ml-auto' : undefined}
          >
            {getInitials(email, email)}
          </Avatar>
        ))}
      </Row>
      <Menu
        anchorEl={menuAnchor}
        open={menuAnchor !== null}
        onClose={() => {
          setMenuAnchor(null)
        }}
      >
        {destinations.map(destination => (
          <MenuItem
            key={destination.id ?? 'none'}
            onClick={() => {
              setMenuAnchor(null)
              onMove?.(destination.id)
            }}
          >
            {destination.name}
          </MenuItem>
        ))}
      </Menu>
    </Card>
  )
}
