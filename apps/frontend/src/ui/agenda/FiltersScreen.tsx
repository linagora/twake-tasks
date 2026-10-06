import { Filter, Icon, Plus, Trash } from '@linagora/twake-icons'
import {
  Button,
  IconButton,
  Link,
  TextField,
  Typography
} from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'
import { Link as RouterLink } from 'react-router'

import type { FilterCriteria } from '@/application/boards'
import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import { FormPanel } from '@/ds/FormPanel'
import { TaskGroup, TaskRow } from '@/ds/TaskList'
import {
  useCreateFilter,
  useDeleteFilter,
  useFilters,
  useLabelNames
} from '@/ui/boards/queries'
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
  const remove = useDeleteFilter()
  const [creating, setCreating] = useState(false)
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
      <div className="u-flex u-flex-items-center u-flex-justify-between u-mb-2">
        <Typography variant="h3" component="h1">
          {t('filters.title')}
        </Typography>
        {!creating && (
          <Button
            startIcon={<Icon icon={Plus} />}
            onClick={() => {
              setCreating(true)
            }}
          >
            {t('filters.new')}
          </Button>
        )}
      </div>
      {creating && (
        <NewFilter
          onClose={() => {
            setCreating(false)
          }}
        />
      )}
      {filters.isError && (
        <Typography role="alert">{t('filters.loadFailed')}</Typography>
      )}
      {filters.isPending && <ListSkeleton label={t('app.loading')} rows={2} />}
      {filters.data?.length === 0 && (
        <EmptyState
          icon={Filter}
          title={t('filters.empty')}
          text={t('filters.emptyHint')}
        />
      )}
      {filters.data && filters.data.length > 0 && (
        <TaskGroup label={t('filters.saved')} count={filters.data.length}>
          {filters.data.map(filter => (
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
                <IconButton
                  size="small"
                  disabled={remove.isPending}
                  onClick={() => {
                    remove.mutate(filter.id)
                  }}
                  aria-label={t('filters.delete', { name: filter.name })}
                >
                  <Icon icon={Trash} size={16} />
                </IconButton>
              }
            />
          ))}
        </TaskGroup>
      )}
    </main>
  )
}

function NewFilter({ onClose }: { onClose: () => void }): ReactElement {
  const { t } = useI18n()
  const create = useCreateFilter()
  const labelNames = useLabelNames()
  const [name, setName] = useState('')
  const [assignee, setAssignee] = useState<(typeof ASSIGNEES)[number]>('')
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('')
  const [label, setLabel] = useState('')
  const [due, setDue] = useState<(typeof DUES)[number]>('')

  const criteria: FilterCriteria = {
    ...(assignee && { assignee }),
    ...(priority && { priority: Number(priority) }),
    ...(label && { label }),
    ...(due && { due })
  }

  return (
    <FormPanel
      title={t('filters.new')}
      onSubmit={event => {
        event.preventDefault()
        create.mutate({ name: name.trim(), criteria }, { onSuccess: onClose })
      }}
      actions={
        <>
          {create.isError && (
            <Typography role="alert" variant="caption" color="error">
              {t('filters.saveFailed')}
            </Typography>
          )}
          <Button variant="text" onClick={onClose}>
            {t('board.cancel')}
          </Button>
          <Button
            type="submit"
            startIcon={<Icon icon={Plus} />}
            disabled={create.isPending || !name.trim()}
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
        {labelNames.data?.map(name => (
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
