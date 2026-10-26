import { Calendar, Icon, List, Mosaic } from '@linagora/twake-icons'
import { ToggleButton, useMediaQuery, useTheme } from '@linagora/twake-mui'
import dayjs from 'dayjs'
import { useMemo, useState, type ReactElement, type ReactNode } from 'react'

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
import {
  ListHeader,
  ListSection,
  ListView,
  type ListColumn
} from '@/ds/ListView'
import { DropListSection, SortableList } from '@/ds/Sortable'
import { HeaderToggleGroup, ToggleLabel } from '@/ds/PageHeader'
import { LAYOUTS, type Board, type Layout, type Task } from '@/domain/board'
import {
  nextSort,
  sortTasks,
  type TaskSort,
  type TaskSortKey
} from '@/domain/taskSort'
import { formatDay, localToday } from '@/ui/boards/dueLabel'
import { useSetLayout } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

const LAYOUT_ICONS = {
  board: Mosaic,
  list: List,
  calendar: Calendar
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
    <HeaderToggleGroup
      exclusive
      size="small"
      value={value}
      aria-label={t('layout.title')}
      onChange={(_event, layout: L | null) => {
        if (layout) onChange(layout)
      }}
    >
      {layouts.map(layout => (
        <ToggleButton
          key={layout}
          value={layout}
          aria-label={t(`layout.${layout}`)}
        >
          <Icon icon={LAYOUT_ICONS[layout]} />
          <ToggleLabel>{t(`layout.${layout}`)}</ToggleLabel>
        </ToggleButton>
      ))}
    </HeaderToggleGroup>
  )
}

export function ListLayout({
  columns,
  row
}: {
  columns: {
    key: string
    name: string
    tasks: Task[]
    footer: ReactNode
    /** Where its tasks are dropped, when the list can be reordered. */
    dropId?: string
  }[]
  /** `sorted`, the list is in the order of a column, which a drag would undo. */
  row: (task: Task, sorted: boolean) => ReactElement
}): ReactElement {
  const { t, lang } = useI18n()
  const [sort, setSort] = useState<TaskSort | null>(null)
  const collator = useMemo(
    () => new Intl.Collator(lang, { sensitivity: 'base', numeric: true }),
    [lang]
  )
  const header = (key: TaskSortKey, name: string): ListColumn => {
    const sorted = sort?.key === key ? sort.order : null
    return {
      name,
      sorted,
      sortLabel: t(
        sorted === 'asc'
          ? 'layout.sortedUp'
          : sorted === 'desc'
            ? 'layout.sortedDown'
            : 'layout.sortBy',
        { column: name }
      ),
      onSort: () => {
        setSort(current => nextSort(current, key))
      }
    }
  }
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
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
        label={t('layout.sortTitle')}
        columns={[
          header('title', t('layout.task')),
          header('assignees', t('task.assignees')),
          header('due', t('layout.due')),
          header('priority', t('task.priority')),
          header('labels', t('task.labels'))
        ]}
      />
      {columns.map(column => {
        const tasks = sort
          ? sortTasks(column.tasks, sort, collator)
          : column.tasks
        const section = {
          label: column.name,
          count: tasks.length,
          expanded: !collapsed.has(column.key),
          onToggle: () => {
            toggle(column.key)
          },
          footer: column.footer
        }
        // A folded section still takes the tasks dropped on its title.
        return column.dropId === undefined || sort ? (
          <ListSection key={column.key} {...section}>
            {tasks.map(task => row(task, sort !== null))}
          </ListSection>
        ) : (
          <DropListSection key={column.key} id={column.dropId} {...section}>
            <SortableList ids={tasks.map(task => task.id)}>
              {tasks.map(task => row(task, false))}
            </SortableList>
          </DropListSection>
        )
      })}
    </ListView>
  )
}

const addDays = (day: string, amount: number) => {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

// The weeks covering a month, from the locale's first day of the week.
function monthGrid(month: string, firstDay: number): string[] {
  const first = `${month}-01`
  const weekday =
    (new Date(`${first}T00:00:00Z`).getUTCDay() - firstDay + 7) % 7
  const start = addDays(first, -weekday)
  const days: string[] = []
  for (let day = start; day.slice(0, 7) <= month || days.length % 7 !== 0;) {
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
/** With `onAdd`, each day and the tray of tasks without a date add one. */
export function CalendarLayout({
  tasks,
  item,
  onAdd
}: {
  tasks: Task[]
  item: (task: Task) => ReactElement
  onAdd?: ((dueDate: string | null) => void) | undefined
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

  return (
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
            <CalendarTray
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
            </CalendarTray>
          )
        }
      >
        <MonthGrid weekdays={weekdays}>
          {monthGrid(month, firstDay).map(day =>
            compact ? (
              <DayButton
                key={day}
                label={formatDay(day, lang)}
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
              <DayCell
                key={day}
                label={formatDay(day, lang)}
                number={Number(day.slice(8))}
                outside={!day.startsWith(month)}
                today={day === today}
                add={addOn(day)}
              >
                <ChipList>{dueOn(day).map(item)}</ChipList>
              </DayCell>
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
}
