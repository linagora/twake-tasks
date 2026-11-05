import { People } from '@linagora/twake-icons'
import { Alert, Avatar, Button } from '@linagora/twake-mui'
import {
  useEffect,
  useEffectEvent,
  useState,
  type ReactElement,
  type Ref
} from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { LabelChip } from '@/ds/Columns'
import {
  FilterBar,
  FilterButton,
  FilterChip,
  FilterField,
  type FilterOption
} from '@/ds/FilterBar'
import { Icon } from '@/ds/Icon'
import { isFolded, type Board, type Task } from '@/domain/board'
import { displayName } from '@/domain/person'
import { anyOf } from '@/ui/agenda/AssigneeField'
import { localToday } from '@/ui/boards/dueLabel'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import {
  DUES,
  NO_FILTER,
  PRIORITIES,
  criteriaCount,
  readFilter,
  savedCriteria,
  taskMatches,
  writeFilter,
  type BoardFilter
} from '@/ui/boards/taskFilter'
import { useI18n } from '@/ui/i18n/useI18n'
import { useSession } from '@/ui/session/SessionGate'
import { shortcutsOn, typing } from '@/ui/shell/Shortcuts'

/** The board's filter lives in the URL, so a copied link shows the same tasks. */
export function useBoardFilter(): [BoardFilter, (next: BoardFilter) => void] {
  const [params, setParams] = useSearchParams()
  const set = (next: BoardFilter) => {
    setParams(current => writeFilter(current, next), { replace: true })
  }
  return [readFilter(params), set]
}

/**
 * The tasks the filter keeps. One added while filtering stays until the
 * filter changes, so the person sees what they added.
 */
export function useShownTasks(
  board: Board,
  tasks: Task[]
): {
  filtered: boolean
  tasks: Task[]
  keep: (taskId: string) => void
  /** What a section heading counts: "3 of 12" open tasks while filtering. */
  count: (shown: number, sectionId: string | null) => number | string
} {
  const { t } = useI18n()
  const { user } = useSession()
  const [filter] = useBoardFilter()
  const filtered = board.layout !== 'progress' && criteriaCount(filter) > 0
  const key = JSON.stringify(filter)
  const [added, setAdded] = useState({ key, ids: new Set<string>() })
  const kept = added.key === key ? added.ids : new Set<string>()
  const context = {
    myEmail: user.email,
    today: localToday(),
    sections: board.sections
  }
  return {
    filtered,
    tasks: filtered
      ? tasks.filter(
          task => kept.has(task.id) || taskMatches(task, filter, context)
        )
      : tasks,
    keep: taskId => {
      if (!filtered) return
      setAdded(current => ({
        key,
        ids: new Set(current.key === key ? current.ids : []).add(taskId)
      }))
    },
    count: (shown, sectionId) =>
      filtered
        ? t('boardFilter.count', {
            shown,
            total: tasks.filter(
              task =>
                task.sectionId === sectionId && !isFolded(task, board.sections)
            ).length
          })
        : shown
  }
}

export function NoMatch(): ReactElement {
  const { t } = useI18n()
  const [, setFilter] = useBoardFilter()
  return (
    <Alert
      severity="info"
      className="u-mb-1"
      action={
        <Button
          variant="text"
          size="small"
          onClick={() => {
            setFilter(NO_FILTER)
          }}
        >
          {t('boardFilter.clearAll')}
        </Button>
      }
    >
      {t('boardFilter.noMatch')}
    </Alert>
  )
}

/** "f" opens the filter, unless the person turned single keys off. */
export function useFilterShortcut(onFilter: (() => void) | undefined): void {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.key !== 'f' ||
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return
    if (!onFilter || typing(event.target) || !shortcutsOn()) return
    event.preventDefault()
    onFilter()
  })
  useEffect(() => {
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [])
}

export function BoardFilterButton({
  count,
  open,
  shortcut,
  onClick
}: {
  count: number
  open: boolean
  shortcut: boolean
  onClick: () => void
}): ReactElement {
  const { t } = useI18n()
  return (
    <FilterButton
      active={count > 0}
      expanded={open}
      shortcut={shortcut ? 'f' : undefined}
      onClick={onClick}
    >
      {count > 0
        ? t('boardFilter.buttonCount', { count })
        : t('boardFilter.button')}
    </FilterButton>
  )
}

export function BoardFilterBar({
  board,
  onClose,
  saveable,
  textRef
}: {
  board: Board
  /** Hides the bar and keeps the filter. */
  onClose: () => void
  /** Off in an embed, which has no Filters page. */
  saveable: boolean
  textRef?: Ref<HTMLInputElement>
}): ReactElement {
  const { t } = useI18n()
  const { user } = useSession()
  const navigate = useNavigate()
  const [filter, setFilter] = useBoardFilter()
  const set =
    <K extends keyof BoardFilter>(key: K) =>
    (value: BoardFilter[K]) => {
      setFilter({ ...filter, [key]: value })
    }
  const myEmail = user.email?.toLowerCase()
  // A link's label reads as the board's own name, whatever its case, and
  // stays listed once it is no longer on the board.
  const pickedLabels = filter.label.map(
    name =>
      board.labels.find(
        label => label.name.toLowerCase() === name.toLowerCase()
      )?.name ?? name
  )
  const labelNames = [
    ...board.labels.map(label => label.name),
    ...pickedLabels.filter(
      name => !board.labels.some(label => label.name === name)
    )
  ]
  const assignees: FilterOption<string>[] = [
    {
      value: 'me',
      name: t('filters.assignees.me'),
      start: <PersonAvatar email={user.email ?? ''} name={user.name} />
    },
    {
      value: 'nobody',
      name: t('filters.assignees.nobody'),
      start: (
        <Avatar size={24}>
          <Icon icon={People} size={14} />
        </Avatar>
      )
    },
    ...board.members
      .filter(person => person.email.toLowerCase() !== myEmail)
      .map(person => ({
        value: person.userId,
        name: displayName(person),
        start: (
          <PersonAvatar
            email={person.email}
            name={person.name}
            avatar={person.avatar}
          />
        )
      }))
  ]

  return (
    <FilterBar
      label={t('boardFilter.label')}
      onEscape={onClose}
      actions={
        <>
          {saveable && criteriaCount({ ...filter, text: '' }) > 0 && (
            <Button
              variant="text"
              size="small"
              onClick={() => {
                void navigate('/filters', {
                  state: { criteria: savedCriteria(filter, board.id) }
                })
              }}
            >
              {t('boardFilter.save')}
            </Button>
          )}
          {criteriaCount(filter) > 0 && (
            <Button
              variant="text"
              size="small"
              onClick={() => {
                setFilter(NO_FILTER)
              }}
            >
              {t('boardFilter.clear')}
            </Button>
          )}
        </>
      }
    >
      <FilterField
        label={t('boardFilter.text')}
        value={filter.text}
        onChange={set('text')}
        inputRef={textRef}
      />
      <Criterion
        name={t('filters.assignee')}
        value={filter.assignee}
        onChange={set('assignee')}
        options={assignees}
      />
      <Criterion
        name={t('filters.label')}
        value={pickedLabels}
        onChange={set('label')}
        options={labelNames.map(name => ({
          value: name,
          name,
          item: (
            <LabelChip
              name={name}
              color={board.labels.find(label => label.name === name)?.color}
            />
          )
        }))}
      />
      <Criterion
        name={t('filters.priority')}
        value={filter.priority}
        onChange={set('priority')}
        options={PRIORITIES.map(level => ({
          value: level,
          name: t('board.priority', { level })
        }))}
      />
      <Criterion
        name={t('filters.due')}
        value={filter.due}
        onChange={set('due')}
        options={DUES.map(due => ({
          value: due,
          name: t(`filters.dues.${due}`)
        }))}
      />
    </FilterBar>
  )
}

function Criterion<T extends string | number>(props: {
  name: string
  options: FilterOption<T>[]
  value: T[]
  onChange: (value: T[]) => void
}): ReactElement {
  const { t, lang } = useI18n()
  const { name, options, value } = props
  const picked = options.flatMap(option =>
    value.includes(option.value) ? [option.name] : []
  )
  return (
    <FilterChip
      {...props}
      shown={t('filters.criterion', { name, value: anyOf(lang, picked) })}
      removeLabel={t('boardFilter.remove', { name })}
    />
  )
}
