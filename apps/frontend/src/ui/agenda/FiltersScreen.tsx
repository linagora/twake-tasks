import { Check, Filter, Icon, Pen, Plus, Trash } from '@linagora/twake-icons'
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
import { TaskGroup, TaskRow } from '@/ds/TaskList'
import { Toast } from '@/ds/Toast'
import {
  useCreateFilter,
  useDeleteFilter,
  useFilters,
  useLabelNames,
  useUpdateFilter
} from '@/ui/boards/queries'
import { PageCrumbs } from '@/ui/boards/Crumbs'
import { useI18n } from '@/ui/i18n/useI18n'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

const ASSIGNEES = ['', 'me', 'nobody'] as const
const PRIORITIES = ['', '1', '2', '3', '4'] as const
const DUES = ['', 'overdue', 'today', 'week', 'none'] as const

// "Any" is an empty value, which MUI would otherwise draw the label over.
const SELECT_SLOTS = {
  select: { native: true },
  inputLabel: { shrink: true }
} as const

export function FiltersScreen(): ReactElement {
  const { t } = useI18n()
  const filters = useFilters()
  const [form, setForm] = useState<SavedFilter | 'new' | null>(null)
  const [deleted, setDeleted] = useState<SavedFilter | null>(null)
  const shown = filters.data?.filter(filter => filter.id !== deleted?.id)
  useDocumentTitle(t('filters.title'))
  const summary = (criteria: FilterCriteria) => {
    const parts = [
      criteria.assignee && {
        name: t('filters.assignee'),
        value: t(`filters.assignees.${criteria.assignee}`)
      },
      criteria.priority !== undefined && {
        name: t('filters.priority'),
        value: t('board.priority', { level: criteria.priority })
      },
      criteria.label && { name: t('filters.label'), value: criteria.label },
      criteria.due && {
        name: t('filters.due'),
        value: t(`filters.dues.${criteria.due}`)
      }
    ].flatMap(part => (part ? [t('filters.criterion', part)] : []))
    return parts.length > 0 ? parts.join(' · ') : t('filters.everything')
  }

  return (
    <main className="u-p-2">
      <PageCrumbs
        origin={{ icon: Filter, label: t('filters.title'), to: '/filters' }}
      />
      <div className="u-flex u-flex-items-center u-flex-justify-between u-mb-2">
        <Typography variant="h3" component="h1">
          {t('filters.title')}
        </Typography>
        {!form && (
          <Button
            startIcon={<Icon icon={Plus} />}
            onClick={() => {
              setForm('new')
            }}
          >
            {t('filters.new')}
          </Button>
        )}
      </div>
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
  const [assignee, setAssignee] = useState<(typeof ASSIGNEES)[number]>(
    initial.assignee ?? ''
  )
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>(
    String(initial.priority ?? '') as (typeof PRIORITIES)[number]
  )
  const [label, setLabel] = useState(initial.label ?? '')
  const [due, setDue] = useState<(typeof DUES)[number]>(initial.due ?? '')
  const save = filter ? update : create
  // A label no board has any more stays choosable, so saving keeps it.
  const labels = [
    ...new Set([...(labelNames.data ?? []), ...(label ? [label] : [])])
  ]

  const criteria: FilterCriteria = {
    ...(assignee && { assignee }),
    ...(priority && { priority: Number(priority) }),
    ...(label && { label }),
    ...(due && { due })
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
      <TextField
        select
        label={t('filters.assignee')}
        value={assignee}
        onChange={event => {
          setAssignee(event.target.value as typeof assignee)
        }}
        slotProps={SELECT_SLOTS}
      >
        {ASSIGNEES.map(value => (
          <option key={value} value={value}>
            {t(`filters.assignees.${value || 'any'}`)}
          </option>
        ))}
      </TextField>
      <TextField
        select
        label={t('filters.priority')}
        value={priority}
        onChange={event => {
          setPriority(event.target.value as typeof priority)
        }}
        slotProps={SELECT_SLOTS}
      >
        {PRIORITIES.map(value => (
          <option key={value} value={value}>
            {value
              ? t('board.priority', { level: value })
              : t('filters.assignees.any')}
          </option>
        ))}
      </TextField>
      <TextField
        select
        label={t('filters.label')}
        value={label}
        onChange={event => {
          setLabel(event.target.value)
        }}
        slotProps={SELECT_SLOTS}
      >
        <option value="">{t('filters.assignees.any')}</option>
        {labels.map(name => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </TextField>
      <TextField
        select
        label={t('filters.due')}
        value={due}
        onChange={event => {
          setDue(event.target.value as typeof due)
        }}
        slotProps={SELECT_SLOTS}
      >
        {DUES.map(value => (
          <option key={value} value={value}>
            {t(`filters.dues.${value || 'any'}`)}
          </option>
        ))}
      </TextField>
    </FormPanel>
  )
}
