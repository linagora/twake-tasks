import { useState } from 'react'

import type {
  BoardSummary,
  Schedule,
  ScheduleRule,
  ScheduleSettings
} from '@/domain/board'
import { localZone } from '@/ui/boards/dueLabel'
import { useBoards } from '@/ui/queries/boards'

export const MAX_EVERY = { daily: 365, weekly: 52, monthly: 12 }
// February 29 is kept: a yearly run on it lands on the 28th in other years.
export const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** As typed: numbers as strings, `on` false for no schedule. */
export interface ScheduleDraft {
  on: boolean
  boardId: string
  kind: ScheduleRule['kind']
  every: string
  weekdays: number[]
  monthDay: string
  month: string
  day: string
  time: string
  workingDays: boolean
  endsOn: string
  paused: boolean
}

export interface ScheduleFieldsProps {
  draft: ScheduleDraft
  set: (changes: Partial<ScheduleDraft>) => void
  /** The project's open boards. */
  boards: BoardSummary[]
  pausedBy: Schedule['pausedBy']
  missing: Missing | null
}

type Missing = 'board' | 'weekdays'

function scheduleDraft(schedule: Schedule | null): ScheduleDraft {
  const rule = schedule?.rule
  return {
    on: schedule !== null,
    boardId: schedule?.boardId ?? '',
    kind: rule?.kind ?? 'weekly',
    every: String(rule && rule.kind !== 'yearly' ? rule.every : 1),
    weekdays: rule?.kind === 'weekly' ? rule.weekdays : [1],
    monthDay: String(rule?.kind === 'monthly' ? rule.day : 1),
    month: String(rule?.kind === 'yearly' ? rule.month : 1),
    day: String(rule?.kind === 'yearly' ? rule.day : 1),
    time: schedule?.time ?? '09:00',
    workingDays: schedule?.workingDays ?? false,
    endsOn: schedule?.endsOn ?? '',
    // The API reports one that paused by itself as paused too, yet saving it
    // resumes it.
    paused: Boolean(schedule?.paused && schedule.pausedBy === null)
  }
}

function ruleOf(draft: ScheduleDraft): ScheduleRule | 'weekdays' {
  const every =
    draft.kind === 'yearly'
      ? 1
      : Math.min(
          Math.max(Math.trunc(Number(draft.every)) || 1, 1),
          MAX_EVERY[draft.kind]
        )
  switch (draft.kind) {
    case 'daily':
      return { kind: 'daily', every }
    case 'weekly':
      if (draft.weekdays.length === 0) return 'weekdays'
      return {
        kind: 'weekly',
        every,
        weekdays: draft.weekdays.toSorted((a, b) => a - b)
      }
    case 'monthly':
      return {
        kind: 'monthly',
        every,
        day: draft.monthDay === 'last' ? 'last' : Number(draft.monthDay)
      }
    case 'yearly': {
      const month = Number(draft.month)
      return {
        kind: 'yearly',
        month,
        day: Math.min(Number(draft.day), DAYS_IN[month - 1] ?? 31)
      }
    }
  }
}

/** What to save, or the field that keeps it from being saved. */
function scheduleSettings(
  draft: ScheduleDraft,
  zone: string
): ScheduleSettings | null | Missing {
  if (!draft.on) return null
  if (!draft.boardId) return 'board'
  const rule = ruleOf(draft)
  if (rule === 'weekdays') return rule
  return {
    boardId: draft.boardId,
    rule,
    time: draft.time,
    zone,
    workingDays: draft.workingDays,
    endsOn: draft.endsOn || null,
    paused: draft.paused
  }
}

/**
 * The schedule section's state. `take` gives what to save, `undefined` to
 * keep the schedule as it is, or `false` when a field is missing.
 */
export function useScheduleDraft(
  current: Schedule | null,
  projectId: string,
  onEdit: () => void
): {
  changed: boolean
  take: () => ScheduleSettings | null | undefined | false
  fields: ScheduleFieldsProps
} {
  const [draft, setDraft] = useState(() => scheduleDraft(current))
  const [missing, setMissing] = useState<Missing | null>(null)
  const loaded = useBoards().data
  const boards =
    loaded?.filter(each => each.project.id === projectId && !each.archived) ??
    []
  // Until the boards load, the schedule keeps its own.
  const resolved = {
    ...draft,
    boardId:
      loaded === undefined || boards.some(each => each.id === draft.boardId)
        ? draft.boardId
        : (boards[0]?.id ?? '')
  }
  const settings = scheduleSettings(resolved, localZone())
  // One that paused by itself resumes when saved as it is.
  const changed =
    JSON.stringify(settings) !==
      JSON.stringify(
        current && scheduleSettings(scheduleDraft(current), localZone())
      ) ||
    (Boolean(current?.pausedBy) && draft.on && !draft.paused)
  return {
    changed,
    take: () => {
      if (typeof settings !== 'string') return changed ? settings : undefined
      setMissing(settings)
      return false
    },
    fields: {
      draft: resolved,
      set: changes => {
        onEdit()
        setMissing(null)
        setDraft({ ...draft, ...changes })
      },
      boards,
      pausedBy: current?.pausedBy ?? null,
      missing
    }
  }
}
