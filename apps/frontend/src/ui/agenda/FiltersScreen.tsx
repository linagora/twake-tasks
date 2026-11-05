import {
  Check,
  Filter,
  Pen,
  Plus,
  Star,
  StarOutline,
  Trash
} from '@linagora/twake-icons'
import {
  Alert,
  Button,
  IconButton,
  Link,
  MenuItem,
  TextField,
  Typography
} from '@linagora/twake-mui'
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactElement
} from 'react'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router'

import type { FilterCriteria, SavedFilter } from '@/application/boards'
import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import { FormPanel } from '@/ds/FormPanel'
import { Icon } from '@/ds/Icon'
import { MultiSelect } from '@/ds/MultiSelect'
import { TaskGroup, TaskRow } from '@/ds/TaskList'
import { Toast } from '@/ds/Toast'
import {
  AssigneeField,
  anyOf,
  useAssigneeName
} from '@/ui/agenda/AssigneeField'
import { useFilterBoards } from '@/ui/agenda/filterBoards'
import {
  useCreateFilter,
  useDeleteFilter,
  useDeleteFilterNow,
  useFilters,
  useUnpinDeletedFilter,
  useSetFilterFavorite,
  useUpdateFilter
} from '@/ui/queries/filters'
import { useLabelNames, useSectionNames } from '@/ui/queries/labels'
import { PageCrumbs } from '@/ui/boards/Crumbs'
import { DUES } from '@/ui/boards/taskFilter'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

const PRIORITIES = ['1', '2', '3', '4'] as const
const STATUSES = ['open', 'done', 'any'] as const
const COMPLETED = ['any', 'today', 'week', 'month'] as const

export function FiltersScreen(): ReactElement {
  const { t, lang } = useI18n()
  const filters = useFilters()
  const assigneeName = useAssigneeName()
  const boards = useFilterBoards()
  const navigate = useNavigate()
  // A board's filter bar opens the form with its criteria.
  const preset = (useLocation().state as { criteria?: FilterCriteria } | null)
    ?.criteria
  const [form, setForm] = useState<SavedFilter | 'new' | null>(
    preset ? 'new' : null
  )
  // What takes the focus once the form closes: 'new', 'link:<id>' or 'edit:<id>'
  const [landing, setLanding] = useState<string | null>(null)
  // Once: a later remount of the target, or a link listed late, must not take it
  const focusOn = (target: string) =>
    landing === target
      ? (element: HTMLElement | null) => {
          if (!element) return
          element.focus()
          setLanding(null)
        }
      : undefined
  const open = (next: SavedFilter | 'new') => {
    setLanding(null)
    setForm(next)
  }
  const [deleted, setDeleted] = useState<SavedFilter | null>(null)
  const unpinDeleted = useUnpinDeletedFilter()
  const shown = filters.data?.filter(filter => filter.id !== deleted?.id)
  useDocumentTitle(t('filters.title'))
  const summary = ({
    board,
    assignee,
    priority,
    label,
    due,
    section,
    text,
    status,
    completed,
    createdBy
  }: FilterCriteria) => {
    const parts = [
      text && {
        name: t('filters.text'),
        value: t('filters.quoted', { text })
      },
      board && {
        name: t('filters.board'),
        value: anyOf(lang, [...new Set(board.map(boards.labelOf))])
      },
      section && { name: t('filters.section'), value: anyOf(lang, section) },
      status && {
        name: t('filters.status'),
        value: t(`filters.statuses.${status}`)
      },
      completed && {
        name: t('filters.completed'),
        value: t(`filters.completedWithin.${completed}`)
      },
      assignee && {
        name: t('filters.assignee'),
        value: anyOf(lang, assignee.map(assigneeName))
      },
      createdBy && {
        name: t('filters.createdBy'),
        value: anyOf(lang, createdBy.map(assigneeName))
      },
      priority && {
        name: t('filters.priority'),
        value: anyOf(
          lang,
          priority.map(level => t('board.priority', { level }))
        )
      },
      label && { name: t('filters.label'), value: anyOf(lang, label) },
      due && {
        name: t('filters.due'),
        value: anyOf(
          lang,
          due.map(value => t(`filters.dues.${value}`))
        )
      }
    ].flatMap(part => (part ? [t('filters.criterion', part)] : []))
    return parts.length > 0 ? parts.join(' · ') : t('filters.everything')
  }

  return (
    <main className="u-ph-2 u-pt-half u-pb-2">
      <PageCrumbs
        origin={{ icon: Filter, label: t('filters.title'), to: '/filters' }}
        heading
        actions={
          !form && (
            <Button
              ref={focusOn('new')}
              startIcon={<Icon icon={Plus} />}
              onClick={() => {
                open('new')
              }}
            >
              {t('filters.new')}
            </Button>
          )
        }
      />
      {form && (
        <FilterForm
          key={form === 'new' ? form : form.id}
          filter={form === 'new' ? undefined : form}
          criteria={form === 'new' ? preset : undefined}
          onClose={saved => {
            // Clears the preset, or a reload would open the form again.
            if (preset) void navigate('.', { replace: true, state: null })
            setLanding(
              saved
                ? `link:${saved}`
                : form === 'new'
                  ? 'new'
                  : `edit:${form.id}`
            )
            setForm(null)
          }}
        />
      )}
      {filters.isError && (
        <Typography role="alert">{t('filters.loadFailed')}</Typography>
      )}
      {filters.isPending && <ListSkeleton label={t('app.loading')} rows={2} />}
      {shown?.length === 0 && (
        <EmptyState
          icon={Filter}
          illustrated
          title={t('filters.empty')}
          text={t('filters.emptyHint')}
        />
      )}
      {shown && shown.length > 0 && (
        <TaskGroup label={t('filters.saved')} count={shown.length}>
          {shown.map(filter => (
            <TaskRow
              key={filter.id}
              label={filter.name}
              leading={<Icon icon={Filter} size={16} />}
              title={
                <Link
                  ref={focusOn(`link:${filter.id}`)}
                  component={RouterLink}
                  to={`/filters/${filter.id}`}
                >
                  {filter.name}
                </Link>
              }
              context={summary(filter.criteria)}
              trailing={
                <>
                  <FavoriteButton filter={filter} />
                  <IconButton
                    ref={focusOn(`edit:${filter.id}`)}
                    size="small"
                    onClick={() => {
                      open(filter)
                    }}
                    aria-label={t('filters.edit', { name: filter.name })}
                  >
                    <Icon icon={Pen} size={16} />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => {
                      if (form !== 'new' && form?.id === filter.id) {
                        setForm(null)
                      }
                      setDeleted(filter)
                      unpinDeleted(filter, true)
                    }}
                    aria-label={t('filters.delete', { name: filter.name })}
                  >
                    <Icon icon={Trash} size={16} />
                  </IconButton>
                </>
              }
            />
          ))}
        </TaskGroup>
      )}
      {deleted && (
        <DeletedNotice
          key={deleted.id}
          filter={deleted}
          onClose={() => {
            setDeleted(null)
          }}
        />
      )}
    </main>
  )
}

function FavoriteButton({ filter }: { filter: SavedFilter }): ReactElement {
  const { t } = useI18n()
  const setFavorite = useSetFilterFavorite()
  return (
    <IconButton
      size="small"
      color={filter.favorite ? 'warning' : 'default'}
      aria-label={t(filter.favorite ? 'filters.unstar' : 'filters.star', {
        name: filter.name
      })}
      onClick={() => {
        if (setFavorite.isPending) return
        setFavorite.mutate({ filterId: filter.id, favorite: !filter.favorite })
      }}
    >
      <Icon icon={filter.favorite ? Star : StarOutline} size={16} />
    </IconButton>
  )
}

// The filter is deleted when the notice goes, by timeout or by leaving the
// page, unless Undo was clicked.
function DeletedNotice({
  filter,
  onClose
}: {
  filter: SavedFilter
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const { mutate: remove } = useDeleteFilter()
  const removeNow = useDeleteFilterNow()
  const unpinDeleted = useUnpinDeletedFilter()
  const settled = useRef(false)
  const leaving = useRef<number>(undefined)
  // An unloading page runs no effect cleanup and no timer. Closing the notice
  // keeps a page restored from the back-forward cache from offering an Undo
  // that can no longer work.
  const unload = useEffectEvent(() => {
    if (settled.current) return
    settled.current = true
    removeNow(filter.id)
    onClose()
  })
  useEffect(() => {
    window.addEventListener('pagehide', unload)
    // StrictMode unmounts once right after mounting: only a real unmount
    // lets the timer run.
    window.clearTimeout(leaving.current)
    return () => {
      window.removeEventListener('pagehide', unload)
      leaving.current = window.setTimeout(() => {
        if (!settled.current) remove(filter.id)
      })
    }
  }, [filter.id, remove])

  return (
    <Toast
      open
      autoHideDuration={6000}
      onClose={(_, reason) => {
        if (reason !== 'clickaway') onClose()
      }}
    >
      <Alert
        severity="info"
        role="status"
        action={
          <Button
            variant="text"
            size="small"
            onClick={() => {
              settled.current = true
              unpinDeleted(filter, false)
              onClose()
            }}
          >
            {t('archive.undo')}
          </Button>
        }
      >
        {t('filters.deleted', { name: filter.name })}
      </Alert>
    </Toast>
  )
}

export function FilterForm({
  filter,
  criteria: given,
  onClose
}: {
  filter?: SavedFilter | undefined
  /** What a new filter starts with. */
  criteria?: FilterCriteria | undefined
  /** Gets the id of the filter when it was saved. */
  onClose: (saved?: string) => void
}): ReactElement {
  const { t } = useI18n()
  const create = useCreateFilter()
  const update = useUpdateFilter(filter?.id ?? '')
  const labelNames = useLabelNames()
  const filterBoards = useFilterBoards()
  const sectionNames = useSectionNames()
  const initial = filter?.criteria ?? given ?? {}
  const [name, setName] = useState(filter?.name ?? '')
  const [text, setText] = useState(initial.text ?? '')
  const [board, setBoard] = useState(initial.board ?? [])
  const [section, setSection] = useState(initial.section ?? [])
  const [status, setStatus] = useState(initial.status ?? 'open')
  const [completed, setCompleted] = useState<(typeof COMPLETED)[number]>(
    initial.completed ?? 'any'
  )
  const [assignee, setAssignee] = useState(initial.assignee ?? [])
  const [createdBy, setCreatedBy] = useState(initial.createdBy ?? [])
  const [priority, setPriority] = useState((initial.priority ?? []).map(String))
  const [label, setLabel] = useState(initial.label ?? [])
  const [due, setDue] = useState(initial.due ?? [])
  const save = filter ? update : create
  // A label no board has any more stays choosable, so saving keeps it.
  const labels = [...new Set([...(labelNames.data ?? []), ...label])]
  // The sections of the boards picked, one per name whatever its case, as
  // the criterion matches them; a section picked stays choosable.
  const names = [
    ...section,
    ...(sectionNames.data ?? [])
      .filter(each => board.length === 0 || board.includes(each.boardId))
      .map(each => each.name)
  ].map(name => ({ name, key: name.toLowerCase() }))
  const sections = names
    .filter(({ key }, index) => names.findIndex(o => o.key === key) === index)
    .map(({ name }) => name)
  // Likewise a board out of reach, so it can be seen and unpicked.
  const boardOptions = [
    ...filterBoards.options,
    ...board.flatMap(id =>
      filterBoards.nameOf(id) === undefined
        ? [{ value: id, name: filterBoards.labelOf(id) }]
        : []
    )
  ]

  const criteria: FilterCriteria = {
    ...(text.trim() && { text: text.trim() }),
    ...(board.length > 0 && { board }),
    ...(section.length > 0 && { section }),
    ...(status !== 'open' && { status }),
    ...(status === 'done' && completed !== 'any' && { completed }),
    ...(assignee.length > 0 && { assignee }),
    ...(createdBy.length > 0 && { createdBy }),
    ...(priority.length > 0 && { priority: priority.map(Number) }),
    ...(label.length > 0 && { label }),
    ...(due.length > 0 && { due })
  }

  return (
    <FormPanel
      title={t(filter ? 'filters.editTitle' : 'filters.new')}
      onSubmit={event => {
        event.preventDefault()
        const changes = { name: name.trim(), criteria }
        if (filter) {
          update.mutate(changes, {
            onSuccess: () => {
              onClose(filter.id)
            }
          })
        } else {
          create.mutate(changes, {
            onSuccess: ({ id }) => {
              onClose(id)
            }
          })
        }
      }}
      actions={
        <>
          {save.isError && (
            <Typography role="alert" variant="caption" color="error">
              {t('filters.saveFailed')}
            </Typography>
          )}
          <Button
            variant="text"
            onClick={() => {
              onClose()
            }}
          >
            {t('board.cancel')}
          </Button>
          <Button
            type="submit"
            startIcon={<Icon icon={filter ? Check : Plus} />}
            disabled={save.isPending || !name.trim()}
          >
            {t('filters.save')}
          </Button>
        </>
      }
    >
      <TextField
        label={t('filters.name')}
        inputRef={focusOnMount}
        value={name}
        onChange={event => {
          setName(event.target.value)
        }}
        slotProps={{ htmlInput: { maxLength: 100 } }}
      />
      <TextField
        label={t('filters.text')}
        value={text}
        onChange={event => {
          setText(event.target.value)
        }}
        slotProps={{ htmlInput: { maxLength: 200 } }}
      />
      <AnyOf
        label={t('filters.board')}
        value={board}
        onChange={setBoard}
        options={boardOptions}
      />
      <AnyOf
        label={t('filters.section')}
        value={section}
        onChange={setSection}
        options={sections.map(value => ({ value, name: value }))}
      />
      <OneOf
        label={t('filters.status')}
        value={status}
        onChange={setStatus}
        options={STATUSES.map(value => ({
          value,
          name: t(`filters.statuses.${value}`)
        }))}
      />
      {status === 'done' && (
        <OneOf
          label={t('filters.completed')}
          value={completed}
          onChange={setCompleted}
          options={COMPLETED.map(value => ({
            value,
            name: t(`filters.completedWithin.${value}`)
          }))}
        />
      )}
      <AssigneeField value={assignee} onChange={setAssignee} />
      <AssigneeField
        label={t('filters.createdBy')}
        value={createdBy}
        onChange={setCreatedBy}
        withNobody={false}
      />
      <AnyOf
        label={t('filters.priority')}
        value={priority}
        onChange={setPriority}
        options={PRIORITIES.map(value => ({
          value,
          name: t('board.priority', { level: value })
        }))}
      />
      <AnyOf
        label={t('filters.label')}
        value={label}
        onChange={setLabel}
        options={labels.map(value => ({ value, name: value }))}
      />
      <AnyOf
        label={t('filters.due')}
        value={due}
        onChange={setDue}
        options={DUES.map(value => ({
          value,
          name: t(`filters.dues.${value}`)
        }))}
      />
    </FormPanel>
  )
}

function OneOf<T extends string>({
  label,
  options,
  value,
  onChange
}: {
  label: string
  options: { value: T; name: string }[]
  value: T
  onChange: (value: T) => void
}): ReactElement {
  return (
    <TextField
      select
      label={label}
      value={value}
      onChange={event => {
        const picked = options.find(
          option => option.value === event.target.value
        )
        if (picked) onChange(picked.value)
      }}
    >
      {options.map(option => (
        <MenuItem key={option.value} value={option.value}>
          {option.name}
        </MenuItem>
      ))}
    </TextField>
  )
}

// Picking nothing matches any value.
function AnyOf<T extends string>(props: {
  label: string
  options: { value: T; name: string }[]
  value: T[]
  onChange: (value: T[]) => void
}): ReactElement {
  const { t, lang } = useI18n()
  const { options, value } = props
  const picked = options.flatMap(option =>
    value.includes(option.value) ? [option.name] : []
  )
  return (
    <MultiSelect
      {...props}
      shown={
        picked.length > 0 ? anyOf(lang, picked) : t('filters.assignees.any')
      }
    />
  )
}
