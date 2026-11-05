import { CalendarToday, ListMin, MosaicMin, Stats } from '@linagora/twake-icons'
import {
  ToggleButton,
  Tooltip,
  useMediaQuery,
  useTheme
} from '@linagora/twake-mui'
import dayjs from 'dayjs'
import { useState, type ReactElement, type ReactNode } from 'react'

import '@/ds/dayjsLocales'

import {
  CalendarBody,
  CalendarToolbar,
  CalendarTray,
  ChipList,
  DayAgenda,
  DayButton,
  DayCell,
  MonthGrid
} from '@/ds/Calendar'
import { Icon } from '@/ds/Icon'
import { ListHeader, ListSection, ListView } from '@/ds/ListView'
import { DropListSection, SortableList } from '@/ds/Sortable'
import { ViewToggleGroup } from '@/ds/PageHeader'
import { addDays } from '@/application/reschedule'
import { LAYOUTS, type Board, type Layout, type Task } from '@/domain/board'
import {
  CalendarDrag,
  DropDayButton,
  DropDayCell,
  DropTray
} from '@/ui/boards/CalendarDrag'
import { formatDay, localToday } from '@/ui/boards/dueLabel'
import { weekStart } from '@/ui/boards/progress'
import type { ListSort, SortKey } from '@/ui/boards/listSort'
import { useSetLayout } from '@/ui/queries/boards'
import { useI18n } from '@/ui/i18n/useI18n'

const LAYOUT_ICONS = {
  board: MosaicMin,
  list: ListMin,
  calendar: CalendarToday,
  progress: Stats
} as const

export function LayoutSwitch({ board }: { board: Board }): ReactElement {
  const setLayout = useSetLayout(board.id)
  return (
    <LayoutToggle
      layouts={LAYOUTS}
      value={board.layout}
      onChange={layout => {
        setLayout.mutate({ layout, everyone: false })
      }}
    />
  )
}

export function LayoutToggle<L extends Layout>({
  layouts,
  value,
  onChange
}: {
  layouts: readonly L[]
  value: L
  onChange: (layout: L) => void
}): ReactElement {
  const { t } = useI18n()
  return (
    <ViewToggleGroup
      exclusive
      size="small"
      value={value}
      aria-label={t('layout.title')}
      onChange={(_event, layout: L | null) => {
        if (layout) onChange(layout)
      }}
    >
      {layouts.map(layout => (
        <Tooltip key={layout} disableInteractive title={t(`layout.${layout}`)}>
          <ToggleButton value={layout} aria-label={t(`layout.${layout}`)}>
            <Icon icon={LAYOUT_ICONS[layout]} size={16} />
          </ToggleButton>
        </Tooltip>
      ))}
    </ViewToggleGroup>
  )
}

export function ListLayout({
  columns,
  row,
  sort,
  onSort
}: {
  columns: {
    key: string
    name: string
    tasks: Task[]
    /** What the heading counts, the tasks by default. */
    count?: number | string
    footer: ReactNode
    /** Where its tasks are dropped, when the list can be reordered. */
    dropId?: string | undefined
  }[]
  row: (task: Task) => ReactElement
  sort: ListSort
  onSort: (key: SortKey) => void
}): ReactElement {
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const sortable = (label: string, key: SortKey) => ({
    label,
    sort: {
      order:
        sort?.key !== key
          ? ('none' as const)
          : sort.descending
            ? ('descending' as const)
            : ('ascending' as const),
      onSort: () => {
        onSort(key)
      }
    }
  })
  const toggle = (key: string) => {
    setCollapsed(keys => {
      const next = new Set(keys)
      if (!next.delete(key)) next.add(key)
      return next
    })
  }

  return (
    <ListView>
      <ListHeader
        columns={[
          sortable(t('layout.task'), 'title'),
          { label: t('task.assignees') },
          sortable(t('layout.due'), 'due'),
          sortable(t('task.priority'), 'priority'),
          { label: t('task.labels') }
        ]}
      />
      {columns.map(column => {
        const section = {
          label: column.name,
          count: column.count ?? column.tasks.length,
          expanded: !collapsed.has(column.key),
          onToggle: () => {
            toggle(column.key)
          },
          footer: column.footer
        }
        // A folded section still takes the tasks dropped on its title.
        return column.dropId === undefined ? (
          <ListSection key={column.key} {...section}>
            {column.tasks.map(task => row(task))}
          </ListSection>
        ) : (
          <DropListSection key={column.key} id={column.dropId} {...section}>
            <SortableList ids={column.tasks.map(task => task.id)}>
              {column.tasks.map(task => row(task))}
            </SortableList>
          </DropListSection>
        )
      })}
    </ListView>
  )
}

// The weeks covering a month, from the locale's first day of the week.
function monthGrid(month: string, firstDay: number): string[] {
  const days: string[] = []
  for (
    let day = weekStart(`${month}-01`, firstDay);
    day.slice(0, 7) <= month || days.length % 7 !== 0;
  ) {
    days.push(day)
    day = addDays(day, 1)
  }
  return days
}

const shiftMonth = (month: string, amount: number) => {
  const date = new Date(`${month}-01T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + amount)
  return date.toISOString().slice(0, 7)
}

// Phones get a grid of day buttons with the picked day's tasks below it,
// since seven columns leave no room for titles.
/**
 * With `onAdd`, each day and the tray of tasks without a date add one. With
 * `onMove`, a task dropped on a day or on the tray gets that day, or none.
 */
export function CalendarLayout({
  tasks,
  item,
  onAdd,
  onMove
}: {
  tasks: Task[]
  item: (task: Task) => ReactElement
  onAdd?: ((dueDate: string | null) => void) | undefined
  onMove?: ((task: Task, day: string | null) => void) | undefined
}): ReactElement {
  const { t, lang } = useI18n()
  const theme = useTheme()
  const compact = useMediaQuery(theme.breakpoints.down('md'))
  const today = localToday()
  const [month, setMonth] = useState(() => today.slice(0, 7))
  const [picked, setPicked] = useState(today)
  const [trayOpen, setTrayOpen] = useState<boolean | null>(null)
  const undated = tasks.filter(task => task.dueDate === null)
  const dueOn = (day: string) => tasks.filter(task => task.dueDate === day)
  const dayLabel = (day: string) =>
    day === today
      ? t('layout.todayDate', { date: formatDay(day, lang) })
      : formatDay(day, lang)
  const addOn = (day: string) =>
    onAdd && {
      label: t('layout.addOn', { date: formatDay(day, lang) }),
      onAdd: () => {
        onAdd(day)
      }
    }
  const title = new Intl.DateTimeFormat(lang, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${month}-01T00:00:00Z`))
  const weekdayName = new Intl.DateTimeFormat(lang, {
    weekday: compact ? 'narrow' : 'short',
    timeZone: 'UTC'
  })
  const firstDay = dayjs().locale(lang).localeData().firstDayOfWeek()
  const weekdays = monthGrid('2024-01', firstDay)
    .slice(0, 7)
    .map(day => weekdayName.format(new Date(`${day}T00:00:00Z`)))
  const Tray = onMove ? DropTray : CalendarTray
  const Cell = onMove ? DropDayCell : DayCell
  const Button = onMove ? DropDayButton : DayButton

  const calendar = (
    <>
      <CalendarToolbar
        title={title}
        previousLabel={t('layout.previousMonth')}
        nextLabel={t('layout.nextMonth')}
        todayLabel={t('layout.today')}
        onPrevious={() => {
          setMonth(shiftMonth(month, -1))
        }}
        onNext={() => {
          setMonth(shiftMonth(month, 1))
        }}
        onToday={() => {
          setMonth(today.slice(0, 7))
          setPicked(today)
        }}
      />
      <CalendarBody
        aside={
          (undated.length > 0 || onAdd) && (
            <Tray
              label={t('layout.noDate')}
              count={undated.length}
              expanded={trayOpen ?? !compact}
              onToggle={() => {
                setTrayOpen(!(trayOpen ?? !compact))
              }}
              add={
                onAdd && {
                  label: t('layout.addUndated'),
                  onAdd: () => {
                    onAdd(null)
                  }
                }
              }
            >
              {undated.map(item)}
            </Tray>
          )
        }
      >
        <MonthGrid weekdays={weekdays}>
          {monthGrid(month, firstDay).map(day =>
            compact ? (
              <Button
                key={day}
                day={day}
                label={dayLabel(day)}
                number={Number(day.slice(8))}
                outside={!day.startsWith(month)}
                today={day === today}
                selected={day === picked}
                marks={dueOn(day).length}
                onSelect={() => {
                  setPicked(day)
                }}
              />
            ) : (
              <Cell
                key={day}
                day={day}
                label={dayLabel(day)}
                number={Number(day.slice(8))}
                outside={!day.startsWith(month)}
                today={day === today}
                add={addOn(day)}
              >
                <ChipList>{dueOn(day).map(item)}</ChipList>
              </Cell>
            )
          )}
        </MonthGrid>
        {compact && (
          <DayAgenda
            label={formatDay(picked, lang)}
            empty={t('layout.nothingDue')}
            add={addOn(picked)}
          >
            {dueOn(picked).map(item)}
          </DayAgenda>
        )}
      </CalendarBody>
    </>
  )
  return onMove ? (
    <CalendarDrag
      tasks={tasks}
      onMove={onMove}
      onShow={day => {
        setMonth(day.slice(0, 7))
        setPicked(day)
      }}
    >
      {calendar}
    </CalendarDrag>
  ) : (
    calendar
  )
}
