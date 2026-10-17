import {
  CalendarToday,
  CrossSmall,
  Dashboard,
  Flag,
  Icon,
  Label,
  Mosaic,
  Pen,
  People,
  Plus,
  Trash
} from '@linagora/twake-icons'
import {
  Button,
  Chip,
  IconButton,
  ListItem,
  ListItemIcon,
  ListItemSecondaryAction,
  ListItemText,
  Menu,
  MenuItem
} from '@linagora/twake-mui'
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode
} from 'react'

import type { Due, FilterCriteria } from '@/application/boards'
import { LabelChip } from '@/ds/Columns'
import { PickerEmpty, PickerOption, PickerPopover } from '@/ds/Picker'
import { ListSection, RowValues } from '@/ds/ListSection'
import { displayName } from '@/domain/person'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import {
  useBoards,
  useLabelNames,
  usePeople,
  useStatusNames
} from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'
import { useSession } from '@/ui/session/SessionGate'

const PRIORITIES = [1, 2, 3, 4] as const
const DUES: readonly Due[] = ['overdue', 'today', 'week', 'none']

interface Option {
  value: string
  label: string
  /** What the search looks into, the label unless said. */
  text?: string
  start?: ReactNode
  /** A label, drawn in its colours both in the picker and once chosen. */
  colored?: boolean
}

type Key = keyof FilterCriteria

/**
 * The criteria of a view, set as the properties of a task are: each shows its
 * values, any number of which a task may match, and a picker to change them.
 * Only the criteria in use show, and the others are added from a menu, which
 * opens the picker of the one chosen.
 */
export function CriteriaFields({
  criteria,
  onChange
}: {
  criteria: FilterCriteria
  onChange: (criteria: FilterCriteria) => void
}): ReactElement {
  const { t } = useI18n()
  const { user } = useSession()
  const boards = useBoards()
  const labelNames = useLabelNames()
  const people = usePeople()
  const statusNames = useStatusNames()
  // The criteria shown: those in use, then those added since, kept though
  // their values are taken off.
  const [shown, setShown] = useState<readonly Key[]>(() =>
    (Object.keys(criteria) as Key[]).filter(
      key => (criteria[key]?.length ?? 0) > 0
    )
  )
  // The criterion just added, whose picker opens where the menu was.
  const [opening, setOpening] = useState<{
    key: Key
    at: { top: number; left: number }
  } | null>(null)
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const set =
    <K extends keyof FilterCriteria>(key: K) =>
    (values: NonNullable<FilterCriteria[K]>) => {
      onChange({ ...criteria, [key]: values.length > 0 ? values : undefined })
    }
  const plain = (value: string, label: string): Option => ({ value, label })

  const boardOptions = (boards.data ?? [])
    .filter(each => !each.archived || criteria.boards?.includes(each.id))
    .map(each => plain(each.id, each.name))
  const person = (
    value: string,
    name: string,
    face: { email: string; name: string | null; avatar?: string | null }
  ): Option => {
    return {
      value,
      label: name,
      text: `${name} ${face.email}`,
      start: (
        <PersonAvatar
          email={face.email}
          name={face.name}
          avatar={face.avatar}
          size={20}
        />
      )
    }
  }
  const assigneeOptions = [
    person('me', t('filters.assignees.me'), {
      email: user.email ?? '',
      name: user.name ?? null
    }),
    plain('nobody', t('filters.assignees.unassigned')),
    ...(people.data ?? []).map(each =>
      person(each.userId, displayName(each), each)
    )
  ]
  // A label of the view that its boards no longer have stays offered.
  const labelOptions = [
    ...new Set([...(labelNames.data ?? []), ...(criteria.labels ?? [])])
  ].map(name => ({ value: name, label: name, colored: true }))
  // A section of the view that its boards no longer have stays offered.
  const statusOptions = [
    ...new Map(
      [...(statusNames.data ?? []), ...(criteria.statuses ?? [])].map(name => [
        name.trim().toLocaleLowerCase(),
        name
      ])
    ).values()
  ].map(name => plain(name, name))
  const priorityOptions = PRIORITIES.map(level =>
    plain(String(level), t('board.priority', { level }))
  )
  const dueOptions = DUES.map(due => plain(due, t(`filters.dues.${due}`)))

  const rows: (Omit<CriterionProps, 'startAt' | 'onDone' | 'onRemove'> & {
    key: Key
  })[] = [
    {
      key: 'boards',
      icon: Dashboard,
      name: t('viewTask.board'),
      options: boardOptions,
      chosen: criteria.boards ?? [],
      onChange: set('boards')
    },
    {
      key: 'statuses',
      icon: Mosaic,
      name: t('viewTask.status'),
      options: statusOptions,
      chosen: criteria.statuses ?? [],
      onChange: set('statuses')
    },
    {
      key: 'assignees',
      icon: People,
      name: t('filters.assignee'),
      searchLabel: t('board.searchPeople'),
      options: assigneeOptions,
      chosen: criteria.assignees ?? [],
      onChange: set('assignees')
    },
    {
      key: 'labels',
      icon: Label,
      name: t('filters.label'),
      searchLabel: t('board.searchLabels'),
      options: labelOptions,
      chosen: criteria.labels ?? [],
      onChange: set('labels')
    },
    {
      key: 'priorities',
      icon: Flag,
      name: t('filters.priority'),
      options: priorityOptions,
      chosen: (criteria.priorities ?? []).map(String),
      onChange: values => {
        set('priorities')(values.map(Number))
      }
    },
    {
      key: 'dues',
      icon: CalendarToday,
      name: t('filters.due'),
      options: dueOptions,
      single: true,
      chosen: criteria.dues ?? [],
      onChange: values => {
        set('dues')(DUES.filter(due => values.includes(due)))
      }
    }
  ]
  const visible = rows.filter(row => shown.includes(row.key))
  const hidden = rows.filter(row => !shown.includes(row.key))

  const openMenu = (event: MouseEvent<HTMLElement>) => {
    setMenu(event.currentTarget)
  }

  return (
    <ListSection
      title={t('filters.filtersSection')}
      action={
        visible.length > 0 &&
        hidden.length > 0 && (
          <IconButton
            size="small"
            aria-label={t('filters.addFilter')}
            aria-haspopup="menu"
            aria-expanded={menu !== null}
            onClick={openMenu}
          >
            <Icon icon={Plus} />
          </IconButton>
        )
      }
    >
      {visible.map(({ key, ...row }) => (
        <CriterionRow
          key={key}
          {...row}
          startAt={opening?.key === key ? opening.at : undefined}
          onDone={() => {
            setOpening(null)
          }}
          onRemove={() => {
            row.onChange([])
            setShown(keys => keys.filter(each => each !== key))
          }}
        />
      ))}
      {visible.length === 0 && (
        <ListItem disableGutters>
          <Button
            variant="text"
            startIcon={<Icon icon={Plus} />}
            aria-haspopup="menu"
            aria-expanded={menu !== null}
            onClick={openMenu}
          >
            {t('filters.addFilter')}
          </Button>
        </ListItem>
      )}
      <Menu
        anchorEl={menu}
        open={menu !== null}
        onClose={() => {
          setMenu(null)
        }}
      >
        {hidden.map(row => (
          <MenuItem
            key={row.key}
            onClick={() => {
              const rect = menu?.getBoundingClientRect()
              setMenu(null)
              setShown(keys => [...keys, row.key])
              setOpening({
                key: row.key,
                at: { top: rect?.bottom ?? 0, left: rect?.left ?? 0 }
              })
            }}
          >
            <ListItemIcon>
              <Icon icon={row.icon} />
            </ListItemIcon>
            <ListItemText>{row.name}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </ListSection>
  )
}

interface CriterionProps {
  icon: Parameters<typeof Icon>[0]['icon']
  name: string
  searchLabel?: string
  /** One value at most, which another one replaces. */
  single?: boolean
  options: Option[]
  chosen: string[]
  onChange: (values: string[]) => void
  /** Its picker opens at once there, as for a criterion just added. */
  startAt: { top: number; left: number } | undefined
  /** Its picker closed. */
  onDone: () => void
  /** Takes the criterion off the view. */
  onRemove: () => void
}

function CriterionRow({
  icon,
  name,
  searchLabel,
  options,
  single = false,
  chosen,
  onChange,
  startAt,
  onDone,
  onRemove
}: CriterionProps): ReactElement {
  const { t } = useI18n()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  // Its first picker only opens there; the plus opens the others.
  const [at, setAt] = useState(startAt)
  useEffect(() => {
    if (at) setAnchor(button.current)
  }, [at])
  const [search, setSearch] = useState('')
  const query = search.trim().toLocaleLowerCase()
  const shown = options.filter(option =>
    (option.text ?? option.label).toLocaleLowerCase().includes(query)
  )
  // In the order of the options, whatever order they were picked in.
  const toggle = (value: string) => {
    const next = chosen.includes(value)
      ? chosen.filter(each => each !== value)
      : single
        ? [value]
        : [...chosen, value]
    onChange(
      options.flatMap(option =>
        next.includes(option.value) ? [option.value] : []
      )
    )
  }

  return (
    <ListItem disableGutters ellipsis={false}>
      <ListItemIcon>
        <Icon icon={icon} />
      </ListItemIcon>
      <ListItemText
        primary={name}
        secondary={
          <RowValues>
            {chosen.map(value => {
              const option = options.find(each => each.value === value)
              const label = option?.label ?? '…'
              const remove = {
                label: t('filters.removeValue', { name: label }),
                onClick: () => {
                  toggle(value)
                }
              }
              return option?.colored ? (
                <LabelChip key={value} name={label} remove={remove} />
              ) : (
                <Chip
                  key={value}
                  size="small"
                  label={label}
                  avatar={option?.start ? <>{option.start}</> : undefined}
                  onDelete={remove.onClick}
                  deleteIcon={
                    <IconButton size="xsmall" aria-label={remove.label}>
                      <Icon icon={CrossSmall} />
                    </IconButton>
                  }
                />
              )
            })}
            {chosen.length === 0 && t('filters.anyValue')}
            {/* After the values: many are added to, one is changed. */}
            <IconButton
              ref={button}
              size="small"
              aria-label={t(
                single ? 'filters.editCriterion' : 'filters.addCriterion',
                { name }
              )}
              onClick={event => {
                setAnchor(event.currentTarget)
              }}
            >
              <Icon icon={single ? Pen : Plus} size={14} />
            </IconButton>
          </RowValues>
        }
      />
      <ListItemSecondaryAction>
        <IconButton
          aria-label={t('filters.removeFilter', { name })}
          onClick={onRemove}
        >
          <Icon icon={Trash} />
        </IconButton>
      </ListItemSecondaryAction>
      {anchor && (
        <PickerPopover
          label={name}
          anchor={anchor}
          onClose={() => {
            setAnchor(null)
            setAt(undefined)
            setSearch('')
            onDone()
          }}
          still
          at={at}
          searchLabel={searchLabel ?? t('filters.search')}
          search={search}
          onSearch={setSearch}
          onPickFirst={() => {
            if (shown[0]) toggle(shown[0].value)
          }}
        >
          {shown.map(option => (
            <PickerOption
              key={option.value}
              checked={chosen.includes(option.value)}
              start={option.start}
              onToggle={() => {
                toggle(option.value)
              }}
            >
              {option.colored ? (
                <LabelChip name={option.label} />
              ) : (
                option.label
              )}
            </PickerOption>
          ))}
          {shown.length === 0 && (
            <PickerEmpty>
              {t('filters.noMatch', { search: search.trim() })}
            </PickerEmpty>
          )}
        </PickerPopover>
      )}
    </ListItem>
  )
}
