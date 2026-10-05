import { Box, Button, Typography } from '@linagora/twake-mui'
import { useId, useState, type ReactElement, type ReactNode } from 'react'

import { DayCell, MonthGrid, Stack } from '@/ds/Calendar'
import { LAYOUTS, type Board, type Task } from '@/domain/board'
import { formatDay, localToday } from '@/ui/boards/dueLabel'
import { useSetLayout } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

export function LayoutSwitch({ board }: { board: Board }): ReactElement {
  const { t } = useI18n()
  const setLayout = useSetLayout(board.id)
  return (
    <Box className="u-ml-auto u-flex u-flex-items-center">
      {board.role === 'admin' && board.layout !== board.defaultLayout && (
        <Button
          variant="text"
          size="small"
          className="u-mr-1"
          onClick={() => {
            setLayout.mutate({ layout: board.layout, everyone: true })
          }}
        >
          {t('layout.useAsDefault')}
        </Button>
      )}
      <div role="group" aria-label={t('layout.title')}>
        {LAYOUTS.map(layout => (
          <Button
            key={layout}
            size="small"
            variant={board.layout === layout ? 'primary' : 'secondary'}
            aria-pressed={board.layout === layout}
            onClick={() => {
              setLayout.mutate({ layout, everyone: false })
            }}
          >
            {t(`layout.${layout}`)}
          </Button>
        ))}
      </div>
    </Box>
  )
}

function Titled({
  title,
  children
}: {
  title: string
  children: ReactNode
}): ReactElement {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="u-mb-2">
      <Typography id={titleId} variant="subtitle1" component="h2">
        {title}
      </Typography>
      {children}
    </section>
  )
}

export function ListLayout({
  columns,
  card
}: {
  columns: { key: string; name: string; tasks: Task[]; footer: ReactNode }[]
  card: (task: Task) => ReactElement
}): ReactElement {
  return (
    <>
      {columns.map(column => (
        <Titled key={column.key} title={column.name}>
          <Stack label={column.name}>
            {column.tasks.map(task => (
              <li key={task.id}>{card(task)}</li>
            ))}
          </Stack>
          {column.footer}
        </Titled>
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

export function CalendarLayout({
  tasks,
  card
}: {
  tasks: Task[]
  card: (task: Task) => ReactElement
}): ReactElement {
  const { t, lang } = useI18n()
  const [month, setMonth] = useState(() => localToday().slice(0, 7))
  const undated = tasks.filter(task => task.dueDate === null)
  const title = new Intl.DateTimeFormat(lang, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${month}-01T00:00:00Z`))

  return (
    <>
      <Box className="u-flex u-flex-items-center u-mb-1">
        <Button
          variant="text"
          size="small"
          onClick={() => {
            setMonth(shiftMonth(month, -1))
          }}
        >
          {t('layout.previousMonth')}
        </Button>
        <Typography variant="h5" component="h2" className="u-mh-1">
          {title}
        </Typography>
        <Button
          variant="text"
          size="small"
          onClick={() => {
            setMonth(shiftMonth(month, 1))
          }}
        >
          {t('layout.nextMonth')}
        </Button>
      </Box>
      <MonthGrid>
        {monthGrid(month).map(day => (
          <DayCell
            key={day}
            label={formatDay(day, lang)}
            number={Number(day.slice(8))}
            outside={!day.startsWith(month)}
          >
            {tasks.filter(task => task.dueDate === day).map(card)}
          </DayCell>
        ))}
      </MonthGrid>
      {undated.length > 0 && (
        <Titled title={t('layout.noDate')}>
          <Stack>{undated.map(card)}</Stack>
        </Titled>
      )}
    </>
  )
}
