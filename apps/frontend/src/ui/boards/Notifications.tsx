import {
  Bell,
  Clock,
  Comment,
  Eye,
  EyeClosed,
  Icon,
  People
} from '@linagora/twake-icons'
import { IconButton, Link, Tooltip, Typography } from '@linagora/twake-mui'
import { useEffect, useReducer, type ReactElement } from 'react'
import { Link as RouterLink } from 'react-router'

import type { Notification } from '@/application/boards'
import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import { LeadingBadge, TaskGroup, TaskRow } from '@/ds/TaskList'
import type { Task } from '@/domain/board'
import { displayName } from '@/domain/person'
import { momentFormat, relativeMoment } from '@/ui/boards/dueLabel'
import { describe } from '@/ui/boards/History'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import {
  useFollowing,
  useNotifications,
  useSetFollowing
} from '@/ui/boards/queries'
import { PageCrumbs } from '@/ui/boards/Crumbs'
import { useI18n, type I18nApi } from '@/ui/i18n/useI18n'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

const REASON_ICONS = {
  assigned: People,
  unassigned: People,
  mentioned: Comment,
  following: Bell,
  reminder: Clock
} as const satisfies Record<Notification['reason'], unknown>

// The wording of the task's History, so both read the same.
function sentenceOf(
  notification: Notification,
  t: I18nApi['t'],
  lang: string
): string {
  const { reason, actor, change } = notification
  if (reason === 'following' && change) {
    return describe(change, undefined, t, lang)
  }
  if (reason !== 'following' && reason !== 'reminder' && actor) {
    return t(`notifications.sentence.${reason}`, { actor: displayName(actor) })
  }
  return t(`notifications.reason.${reason}`)
}

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
  const followed = set.isPending ? set.variables : following.data === true
  const label = followed
    ? t('notifications.followingTask')
    : t('notifications.follow')

  // An eye, as the "watch" of trackers, crossed out while not followed.
  const button = (
    <IconButton
      size="small"
      aria-pressed={followed}
      disabled={!following.isSuccess}
      onClick={() => {
        if (set.isPending) return
        set.mutate(!followed)
      }}
      aria-label={label}
    >
      <Icon icon={followed ? Eye : EyeClosed} />
    </IconButton>
  )
  // A disabled button gets no hover, so no tooltip until it is known.
  if (!following.isSuccess) return button
  return (
    <Tooltip
      title={followed ? t('notifications.unfollow') : t('notifications.follow')}
      describeChild={followed}
    >
      {button}
    </Tooltip>
  )
}

export function NotificationsScreen(): ReactElement {
  const { t, lang } = useI18n()
  useDocumentTitle(t('notifications.title'))
  const notifications = useNotifications()
  const format = momentFormat(lang)
  // "5 min ago" moves on while the page stays open.
  const [, tick] = useReducer((count: number) => count + 1, 0)
  useEffect(() => {
    const timer = setInterval(tick, 60_000)
    return () => {
      clearInterval(timer)
    }
  }, [])
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
    <main className="u-ph-2 u-pt-half u-pb-2">
      <PageCrumbs
        origin={{
          icon: Bell,
          label: t('notifications.title'),
          to: '/notifications'
        }}
        heading
      />
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
                const at = new Date(notification.createdAt)
                const { actor } = notification
                const icon = REASON_ICONS[notification.reason]
                return (
                  <TaskRow
                    key={notification.id}
                    label={`${notification.key} ${notification.title}`}
                    unread={notification.readAt === null}
                    leading={
                      actor ? (
                        <LeadingBadge badge={<Icon icon={icon} size={10} />}>
                          <PersonAvatar
                            email={actor.email}
                            name={actor.name}
                            avatar={actor.avatar}
                            size={32}
                          />
                        </LeadingBadge>
                      ) : (
                        <Icon icon={icon} size={16} />
                      )
                    }
                    title={
                      <>
                        {`${sentenceOf(notification, t, lang)} · `}
                        <Link
                          component={RouterLink}
                          to={`/boards/${notification.boardId}?task=${notification.key}`}
                        >
                          {notification.title}
                        </Link>
                      </>
                    }
                    excerpt={notification.commentExcerpt}
                    context={`${notification.key} · ${notification.boardName}`}
                    facts={
                      <Typography
                        variant="caption"
                        color="textSecondary"
                        component="time"
                        dateTime={notification.createdAt}
                        title={format.format(at)}
                      >
                        {relativeMoment(at, t, lang)}
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
