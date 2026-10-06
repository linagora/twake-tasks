import { Bell, Icon } from '@linagora/twake-icons'
import { Button, Link, Typography } from '@linagora/twake-mui'
import type { ReactElement } from 'react'
import { Link as RouterLink } from 'react-router'

import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import type { Task } from '@/domain/board'
import {
  useFollowing,
  useNotifications,
  useSetFollowing
} from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

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
      <ul>
        {notifications.data?.map(notification => (
          <li key={notification.id}>
            <Link
              component={RouterLink}
              to={`/boards/${notification.boardId}?task=${notification.key}`}
            >
              {notification.readAt === null ? (
                <strong>{`${notification.key} ${notification.title}`}</strong>
              ) : (
                `${notification.key} ${notification.title}`
              )}
            </Link>
            <Typography variant="body2">
              {t(`notifications.reason.${notification.reason}`)}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {format.format(new Date(notification.createdAt))}
            </Typography>
          </li>
        ))}
      </ul>
    </main>
  )
}
