import { PROGRESS_DAYS, type DayCount } from '@/application/boards'
import { addDays } from '@/application/reschedule'
import {
  isDone,
  type Board,
  type Label,
  type Person,
  type Priority,
  type Section,
  type Task
} from '@/domain/board'
import { displayName } from '@/domain/person'

export interface Load {
  open: number
  overdue: number
  dueWeek: number
}

export interface BoardProgress extends Load {
  /** The top-level tasks, open or not. */
  total: number
  /** Every task of each section, the tasks outside sections first if any. */
  sections: { section: Section | null; count: number }[]
  /** The assignees of open tasks, the busiest first. */
  people: (Load & { person: Person })[]
  nobody: Load
  priorities: { priority: Priority | null; count: number }[]
  /** The labels of open tasks, the most used first. */
  labels: { label: Label; count: number }[]
}

const isClosed = (task: Task, sections: readonly Section[]): boolean => {
  const section = sections.find(each => each.id === task.sectionId)
  return section
    ? section.category === 'canceled' || section.category === 'completed'
    : isDone(task, sections) || task.canceledAt !== null
}

const isLate = (task: Task, today: string): boolean =>
  task.dueDate !== null && task.dueDate < today

function topLevel(board: Board): { tasks: Task[]; open: Task[] } {
  const tasks = board.tasks.filter(task => task.parentId === null)
  return { tasks, open: tasks.filter(task => !isClosed(task, board.sections)) }
}

/** Due this week reads as the filter's: today and the six days after. */
export function boardProgress(board: Board, today: string): BoardProgress {
  const { tasks, open } = topLevel(board)
  const dueWeek = (task: Task) =>
    task.dueDate !== null &&
    task.dueDate >= today &&
    task.dueDate < addDays(today, 7)
  const loadOf = (some: Task[]): Load => ({
    open: some.length,
    overdue: some.filter(task => isLate(task, today)).length,
    dueWeek: some.filter(dueWeek).length
  })
  const assignees = new Map<string, Person>()
  for (const task of open)
    for (const person of task.assignees) assignees.set(person.userId, person)
  const loose = tasks.filter(
    task => !board.sections.some(section => section.id === task.sectionId)
  )
  const labelCounts = board.labels.map(label => ({
    label,
    count: open.filter(task => task.labels.some(each => each.id === label.id))
      .length
  }))

  return {
    ...loadOf(open),
    total: tasks.length,
    sections: [
      ...(loose.length > 0 ? [{ section: null, count: loose.length }] : []),
      ...board.sections.map(section => ({
        section,
        count: tasks.filter(task => task.sectionId === section.id).length
      }))
    ],
    people: [...assignees.values()]
      .map(person => ({
        person,
        ...loadOf(
          open.filter(task =>
            task.assignees.some(each => each.userId === person.userId)
          )
        )
      }))
      .sort(
        (a, b) =>
          b.open - a.open ||
          displayName(a.person).localeCompare(displayName(b.person))
      ),
    nobody: loadOf(open.filter(task => task.assignees.length === 0)),
    priorities: ([1, 2, 3, 4, null] as const).map(priority => ({
      priority,
      count: open.filter(task => task.priority === priority).length
    })),
    labels: labelCounts
      .filter(each => each.count > 0)
      .sort(
        (a, b) => b.count - a.count || a.label.name.localeCompare(b.label.name)
      )
  }
}

export interface BoardNumbers {
  open: number
  late: number
  /** Open, in a started section, and not late. */
  started: number
  done: number
  /** The top-level tasks not canceled, which `done` is a share of. */
  counted: number
  /** The nearest due date of an open task, from today on. */
  nextDue: string | null
}

/** The board at a glance, from its top-level tasks. */
export function boardNumbers(board: Board, today: string): BoardNumbers {
  const categoryOf = (task: Task) =>
    board.sections.find(each => each.id === task.sectionId)?.category
  const isCanceled = (task: Task) => {
    const category = categoryOf(task)
    return category ? category === 'canceled' : task.canceledAt !== null
  }
  const { tasks, open } = topLevel(board)
  const counted = tasks.filter(task => !isCanceled(task))
  const late = open.filter(task => isLate(task, today))
  const started = open.filter(
    task => !isLate(task, today) && categoryOf(task) === 'started'
  )
  const upcoming = open
    .map(task => task.dueDate)
    .filter((due): due is string => due !== null && due >= today)
    .sort()
  return {
    open: open.length,
    late: late.length,
    started: started.length,
    done: counted.length - open.length,
    counted: counted.length,
    nextDue: upcoming[0] ?? null
  }
}

/** The day `day`'s week starts on, `firstDay` being 0 for Sunday. */
export function weekStart(day: string, firstDay: number): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
  return addDays(day, -((weekday - firstDay + 7) % 7))
}

/**
 * The last eight weeks up to the current one, oldest first, with the tasks
 * completed in each, and those of today and the six days before.
 */
export function completionsByWeek(
  days: readonly DayCount[],
  today: string,
  firstDay: number
): { weeks: { start: string; done: number }[]; lastSevenDays: number } {
  const doneIn = (from: string, until: string) =>
    days
      .filter(each => each.day >= from && each.day < until)
      .reduce((sum, each) => sum + each.done, 0)
  const current = weekStart(today, firstDay)
  const weeks = Array.from({ length: PROGRESS_DAYS / 7 }, (_, index) => {
    const start = addDays(current, 7 * (index + 1 - PROGRESS_DAYS / 7))
    return { start, done: doneIn(start, addDays(start, 7)) }
  })
  return {
    weeks,
    lastSevenDays: doneIn(addDays(today, -6), addDays(today, 1))
  }
}
