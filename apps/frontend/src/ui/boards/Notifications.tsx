import { Bell, Clock, Comment, Icon, People } from '@linagora/twake-icons'
import { Button, Link, Typography } from '@linagora/twake-mui'
import type { ReactElement } from 'react'
import { Link as RouterLink } from 'react-router'

import type { Notification } from '@/application/boards'
import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import { TaskGroup, TaskRow } from '@/ds/TaskList'
import type { Task } from '@/domain/board'
import {
  useFollowing,
  useNotifications,
  useSetFollowing
} from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

const REASON_ICONS = {
  assigned: People,
  mentioned: Comment,
  following: Bell,
  reminder: Clock
} as const satisfies Record<Notification['reason'], unknown>

export function FollowButton({
  task,
  boardId
}: {
  task: Task
  boardId: string
}): ReactElement {
  const { t } = useI18n()
  const following = useFollowing(boardId, task.id)
  const set = useSetFollowing(boardId, task.id)
  const pressed = set.isPending ? set.variables : following.data === true

  return (
    <Button
      variant={pressed ? 'secondary' : 'text'}
      size="small"
      startIcon={<Icon icon={Bell} size={16} />}
      aria-pressed={pressed}
      disabled={!following.isSuccess}
      onClick={() => {
        set.mutate(!pressed)
      }}
    >
      {t('notifications.follow')}
    </Button>
  )
}

export function NotificationsScreen(): ReactElement {
  const { t, lang } = useI18n()
  useDocumentTitle(t('notifications.title'))
  const notifications = useNotifications()
  const format = new Intl.DateTimeFormat(lang, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
  const all = notifications.data ?? []
  const groups = [
    {
      label: t('notifications.new'),
      items: all.filter(each => each.readAt === null)
    },
    {
      label: t('notifications.earlier'),
      items: all.filter(each => each.readAt !== null)
    }
  ]

  return (
    <main className="u-p-2">
      <Typography variant="h3" component="h1" className="u-mb-2">
        {t('notifications.title')}
      </Typography>
      {notifications.isError && (
        <Typography role="alert">{t('notifications.loadFailed')}</Typography>
      )}
      {notifications.isPending && <ListSkeleton label={t('app.loading')} />}
      {notifications.data?.length === 0 && (
        <EmptyState
          icon={Bell}
          title={t('notifications.empty')}
          text={t('notifications.emptyHint')}
        />
      )}
      {groups.map(
        group =>
          group.items.length > 0 && (
            <TaskGroup
              key={group.label}
              label={group.label}
              count={group.items.length}
            >
              {group.items.map(notification => {
                const name = `${notification.key} ${notification.title}`
                return (
                  <TaskRow
                    key={notification.id}
                    label={name}
                    unread={notification.readAt === null}
                    leading={
                      <Icon
                        icon={REASON_ICONS[notification.reason]}
                        size={16}
                      />
                    }
                    title={
                      <Link
                        component={RouterLink}
                        to={`/boards/${notification.boardId}?task=${notification.key}`}
                      >
                        {name}
                      </Link>
                    }
                    context={t(`notifications.reason.${notification.reason}`)}
                    facts={
                      <Typography variant="caption" color="textSecondary">
                        {format.format(new Date(notification.createdAt))}
                      </Typography>
                    }
                  />
                )
              })}
            </TaskGroup>
          )
      )}
    </main>
  )
}
