import { People, Stats } from '@linagora/twake-icons'
import { Avatar, Typography } from '@linagora/twake-mui'
import dayjs from 'dayjs'
import type { ReactElement } from 'react'

import '@/ds/dayjsLocales'

import { LabelChip } from '@/ds/Columns'
import { EmptyState } from '@/ds/EmptyState'
import { Icon } from '@/ds/Icon'
import { LoadList, LoadRow } from '@/ds/LoadList'
import {
  ProgressCard,
  ProgressFailure,
  ProgressGrid,
  ShareBar,
  ShareBars,
  StatTile,
  StatTiles,
  WeekBars,
  WeekBarsSkeleton
} from '@/ds/Progress'
import type { Board } from '@/domain/board'
import { displayName } from '@/domain/person'
import { useBoardFilter } from '@/ui/boards/BoardFilter'
import { localToday, shortDay } from '@/ui/boards/dueLabel'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import { boardProgress, completionsByWeek } from '@/ui/boards/progress'
import { NO_FILTER, type BoardFilter } from '@/ui/boards/taskFilter'
import { useI18n } from '@/ui/i18n/useI18n'
import { useCompletions, useSetLayout } from '@/ui/queries/boards'

/**
 * Where the board stands, from its top-level tasks. The on-screen filter
 * does not apply: each count opens the Kanban filtered on what it counts.
 */
export function ProgressLayout({ board }: { board: Board }): ReactElement {
  const { t, lang } = useI18n()
  const today = localToday()
  const progress = boardProgress(board, today)
  const completions = useCompletions(board.id)
  const firstDay = dayjs().locale(lang).localeData().firstDayOfWeek()
  const byWeek = completions.data
    ? completionsByWeek(completions.data, today, firstDay)
    : null
  const [, setFilter] = useBoardFilter()
  const setLayout = useSetLayout(board.id)
  const show = (filter: Partial<BoardFilter>) => () => {
    setFilter({ ...NO_FILTER, ...filter })
    setLayout.mutate({ layout: 'board', everyone: false })
  }
  const percent = new Intl.NumberFormat(lang, {
    style: 'percent',
    maximumFractionDigits: 0
  })
  const tinyDay = new Intl.DateTimeFormat(lang, {
    month: 'numeric',
    day: 'numeric',
    timeZone: 'UTC'
  })
  const share = (name: string, count: number, of: number) => {
    const ratio = of === 0 ? 0 : count / of
    return {
      value: `${String(count)} · ${percent.format(ratio)}`,
      share: ratio,
      label: t('progress.share', {
        name,
        smart_count: count,
        percent: percent.format(ratio)
      })
    }
  }

  if (progress.total === 0) {
    return (
      <EmptyState
        illustrated
        icon={Stats}
        title={t('progress.empty')}
        text={t('progress.emptyHint')}
      />
    )
  }

  const tile = (
    label: string,
    value: number,
    filter?: Partial<BoardFilter>,
    tone?: 'error'
  ) => (
    <StatTile
      label={label}
      value={value}
      tone={tone}
      action={
        filter && {
          label: t('progress.show', { label, count: value }),
          onClick: show(filter)
        }
      }
    />
  )
  const currentWeek = byWeek?.weeks.at(-1)?.start

  return (
    <>
      <StatTiles>
        {tile(t('progress.open'), progress.open, {})}
        {tile(
          t('progress.overdue'),
          progress.overdue,
          { due: ['overdue'] },
          'error'
        )}
        {tile(t('progress.dueWeek'), progress.dueWeek, { due: ['week'] })}
        {tile(t('progress.doneWeek'), byWeek?.lastSevenDays ?? 0)}
        {tile(t('progress.noAssignee'), progress.nobody.open, {
          assignee: ['nobody']
        })}
      </StatTiles>
      <ProgressGrid>
        <ProgressCard title={t('progress.donePerWeek')}>
          {completions.isError ? (
            <ProgressFailure
              message={t('progress.loadFailed')}
              retry={t('session.retry')}
              onRetry={() => {
                void completions.refetch()
              }}
            />
          ) : byWeek ? (
            <WeekBars
              label={t('progress.donePerWeek')}
              weeks={byWeek.weeks.map(week => ({
                key: week.start,
                done: week.done,
                short: shortDay(week.start, lang),
                tiny: tinyDay.format(new Date(week.start)),
                long: t('progress.weekBar', {
                  date: shortDay(week.start, lang),
                  smart_count: week.done
                }),
                current: week.start === currentWeek
              }))}
            />
          ) : (
            <WeekBarsSkeleton label={t('app.loading')} />
          )}
        </ProgressCard>
        <ProgressCard title={t('progress.bySection')}>
          <ShareBars>
            {progress.sections.map(({ section, count }) => {
              const name = section?.name ?? t('board.noSection')
              return (
                <ShareBar
                  key={section?.id ?? 'none'}
                  name={name}
                  tone={
                    section?.category === 'completed' ? 'success' : 'primary'
                  }
                  {...share(name, count, progress.total)}
                />
              )
            })}
          </ShareBars>
        </ProgressCard>
        <ProgressCard title={t('progress.byPerson')}>
          {progress.open === 0 ? (
            <Typography variant="body2" color="textSecondary">
              {t('progress.nothingOpen')}
            </Typography>
          ) : (
            <LoadList
              columns={[
                t('progress.open'),
                t('progress.overdue'),
                t('progress.dueWeek')
              ]}
            >
              {[
                ...progress.people.map(load => ({
                  key: load.person.userId,
                  name: displayName(load.person),
                  avatar: (
                    <PersonAvatar
                      email={load.person.email}
                      name={load.person.name}
                      avatar={load.person.avatar}
                    />
                  ),
                  load,
                  assignee: load.person.userId
                })),
                ...(progress.nobody.open > 0
                  ? [
                      {
                        key: 'nobody',
                        name: t('filters.assignees.nobody'),
                        avatar: (
                          <Avatar size={24}>
                            <Icon icon={People} size={14} />
                          </Avatar>
                        ),
                        load: progress.nobody,
                        assignee: 'nobody'
                      }
                    ]
                  : [])
              ].map(row => (
                <LoadRow
                  key={row.key}
                  avatar={row.avatar}
                  name={row.name}
                  counts={[row.load.open, row.load.overdue, row.load.dueWeek]}
                  label={t('progress.person', {
                    name: row.name,
                    open: row.load.open,
                    overdue: row.load.overdue,
                    dueWeek: row.load.dueWeek
                  })}
                  onClick={show({ assignee: [row.assignee] })}
                />
              ))}
            </LoadList>
          )}
        </ProgressCard>
        <ProgressCard title={t('progress.byPriority')}>
          <ShareBars>
            {progress.priorities.map(({ priority, count }) => {
              const name =
                priority === null
                  ? t('progress.noPriority')
                  : t('board.priority', { level: priority })
              return (
                <ShareBar
                  key={priority ?? 'none'}
                  name={name}
                  {...share(name, count, progress.open)}
                />
              )
            })}
          </ShareBars>
        </ProgressCard>
        <ProgressCard title={t('progress.byLabel')}>
          {progress.labels.length === 0 ? (
            <Typography variant="body2" color="textSecondary">
              {t('progress.noLabels')}
            </Typography>
          ) : (
            <ShareBars>
              {progress.labels.map(({ label, count }) => (
                <ShareBar
                  key={label.id}
                  name={<LabelChip name={label.name} color={label.color} />}
                  {...share(label.name, count, progress.open)}
                />
              ))}
            </ShareBars>
          )}
        </ProgressCard>
      </ProgressGrid>
    </>
  )
}
