import {
  Check,
  Filter,
  Icon,
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
  TextField,
  Typography
} from '@linagora/twake-mui'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Link as RouterLink } from 'react-router'

import type { FilterCriteria, SavedFilter } from '@/application/boards'
import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import { FormPanel } from '@/ds/FormPanel'
import { MultiSelect } from '@/ds/MultiSelect'
import { TaskGroup, TaskRow } from '@/ds/TaskList'
import { Toast } from '@/ds/Toast'
import {
  useCreateFilter,
  useDeleteFilter,
  useFilters,
  useUnpinDeletedFilter,
  useLabelNames,
  useSetFilterFavorite,
  useUpdateFilter
} from '@/ui/boards/queries'
import { PageCrumbs } from '@/ui/boards/Crumbs'
import { useI18n } from '@/ui/i18n/useI18n'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

const ASSIGNEES = ['me', 'nobody'] as const
const PRIORITIES = ['1', '2', '3', '4'] as const
const DUES = ['overdue', 'today', 'week', 'none'] as const

const anyOf = (lang: string, values: string[]) =>
  new Intl.ListFormat(lang, { type: 'disjunction' }).format(values)

export function FiltersScreen(): ReactElement {
  const { t, lang } = useI18n()
  const filters = useFilters()
  const [form, setForm] = useState<SavedFilter | 'new' | null>(null)
  const [deleted, setDeleted] = useState<SavedFilter | null>(null)
  const unpinDeleted = useUnpinDeletedFilter()
  const shown = filters.data?.filter(filter => filter.id !== deleted?.id)
  useDocumentTitle(t('filters.title'))
  const summary = ({ assignee, priority, label, due }: FilterCriteria) => {
    const parts = [
      assignee && {
        name: t('filters.assignee'),
        value: anyOf(
          lang,
          assignee.map(value => t(`filters.assignees.${value}`))
        )
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
              startIcon={<Icon icon={Plus} />}
              onClick={() => {
                setForm('new')
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
          onClose={() => {
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
                <Link component={RouterLink} to={`/filters/${filter.id}`}>
                  {filter.name}
                </Link>
              }
              context={summary(filter.criteria)}
              trailing={
                <>
                  <FavoriteButton filter={filter} />
                  <IconButton
                    size="small"
                    onClick={() => {
                      setForm(filter)
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
  const unpinDeleted = useUnpinDeletedFilter()
  const undone = useRef(false)
  const leaving = useRef<number>(undefined)
  useEffect(() => {
    // StrictMode unmounts once right after mounting: only a real unmount
    // lets the timer run.
    window.clearTimeout(leaving.current)
    return () => {
      leaving.current = window.setTimeout(() => {
        if (!undone.current) remove(filter.id)
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
              undone.current = true
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
  onClose
}: {
  filter?: SavedFilter | undefined
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const create = useCreateFilter()
  const update = useUpdateFilter(filter?.id ?? '')
  const labelNames = useLabelNames()
  const initial = filter?.criteria ?? {}
  const [name, setName] = useState(filter?.name ?? '')
  const [assignee, setAssignee] = useState(initial.assignee ?? [])
  const [priority, setPriority] = useState((initial.priority ?? []).map(String))
  const [label, setLabel] = useState(initial.label ?? [])
  const [due, setDue] = useState(initial.due ?? [])
  const save = filter ? update : create
  // A label no board has any more stays choosable, so saving keeps it.
  const labels = [...new Set([...(labelNames.data ?? []), ...label])]

  const criteria: FilterCriteria = {
    ...(assignee.length > 0 && { assignee }),
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
        if (filter) update.mutate(changes, { onSuccess: onClose })
        else create.mutate(changes, { onSuccess: onClose })
      }}
      actions={
        <>
          {save.isError && (
            <Typography role="alert" variant="caption" color="error">
              {t('filters.saveFailed')}
            </Typography>
          )}
          <Button variant="text" onClick={onClose}>
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
        value={name}
        onChange={event => {
          setName(event.target.value)
        }}
        slotProps={{ htmlInput: { maxLength: 100 } }}
      />
      <AnyOf
        label={t('filters.assignee')}
        value={assignee}
        onChange={setAssignee}
        options={ASSIGNEES.map(value => ({
          value,
          name: t(`filters.assignees.${value}`)
        }))}
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
