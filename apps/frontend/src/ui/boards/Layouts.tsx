import { Calendar, Icon, List, Mosaic } from '@linagora/twake-icons'
import { ToggleButton, useMediaQuery, useTheme } from '@linagora/twake-mui'
import { useState, type ReactElement, type ReactNode } from 'react'

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
import { ListHeader, ListSection } from '@/ds/ListView'
import { HeaderToggleGroup, ToggleLabel } from '@/ds/PageHeader'
import { LAYOUTS, type Board, type Layout, type Task } from '@/domain/board'
import { formatDay, localToday } from '@/ui/boards/dueLabel'
import { useSetLayout } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

const LAYOUT_ICONS = { board: Mosaic, list: List, calendar: Calendar } as const

export function LayoutSwitch({ board }: { board: Board }): ReactElement {
  const { t } = useI18n()
  const setLayout = useSetLayout(board.id)
  return (
    <HeaderToggleGroup
      exclusive
      size="small"
      value={board.layout}
      aria-label={t('layout.title')}
      onChange={(_event, layout: Layout | null) => {
        if (layout) setLayout.mutate({ layout, everyone: false })
      }}
    >
      {LAYOUTS.map(layout => (
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
  columns: { key: string; name: string; tasks: Task[]; footer: ReactNode }[]
  row: (task: Task) => ReactElement
}): ReactElement {
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const toggle = (key: string) => {
    setCollapsed(keys => {
      const next = new Set(keys)
      if (!next.delete(key)) next.add(key)
      return next
    })
  }

  return (
    <>
      <ListHeader
        columns={[
          t('layout.task'),
          t('task.assignees'),
          t('layout.due'),
          t('task.priority'),
          t('task.labels')
        ]}
      />
      {columns.map(column => (
        <ListSection
          key={column.key}
          label={column.name}
          count={column.tasks.length}
          expanded={!collapsed.has(column.key)}
          onToggle={() => {
            toggle(column.key)
          }}
          footer={column.footer}
        >
          {column.tasks.map(row)}
        </ListSection>
      ))}
    </>
  )
}

const addDays = (day: string, amount: number) => {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

// The weeks covering a month, Monday first.
function monthGrid(month: string): string[] {
  const first = `${month}-01`
  const weekday = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7
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
export function CalendarLayout({
  tasks,
  item
}: {
  tasks: Task[]
  item: (task: Task) => ReactElement
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
  const title = new Intl.DateTimeFormat(lang, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${month}-01T00:00:00Z`))
  const weekdayName = new Intl.DateTimeFormat(lang, {
    weekday: compact ? 'narrow' : 'short',
    timeZone: 'UTC'
  })
  const weekdays = monthGrid('2024-01')
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
          undated.length > 0 && (
            <CalendarTray
              label={t('layout.noDate')}
              count={undated.length}
              expanded={trayOpen ?? !compact}
              onToggle={() => {
                setTrayOpen(!(trayOpen ?? !compact))
              }}
            >
              {undated.map(item)}
            </CalendarTray>
          )
        }
      >
        <MonthGrid weekdays={weekdays}>
          {monthGrid(month).map(day =>
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
          >
            {dueOn(picked).map(item)}
          </DayAgenda>
        )}
      </CalendarBody>
    </>
  )
}
