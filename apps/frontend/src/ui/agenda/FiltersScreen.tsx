import { Filter, Icon, Plus } from '@linagora/twake-icons'
import { Button, Link, TextField, Typography } from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'
import { Link as RouterLink } from 'react-router'

import type { FilterCriteria } from '@/application/boards'
import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import { FormPanel } from '@/ds/FormPanel'
import {
  useCreateFilter,
  useDeleteFilter,
  useFilters
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
  useDocumentTitle(t('filters.title'))

  return (
    <main className="u-p-2">
      <Typography variant="h3" component="h1" className="u-mb-2">
        {t('filters.title')}
      </Typography>
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
      <ul>
        {filters.data?.map(filter => (
          <li key={filter.id}>
            <Link component={RouterLink} to={`/filters/${filter.id}`}>
              {filter.name}
            </Link>
            <Button
              variant="text"
              size="small"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate(filter.id)
              }}
              aria-label={t('filters.delete', { name: filter.name })}
            >
              ×
            </Button>
          </li>
        ))}
      </ul>
      <NewFilter />
    </main>
  )
}

function NewFilter(): ReactElement {
  const { t } = useI18n()
  const create = useCreateFilter()
  const [name, setName] = useState('')
  const [assignee, setAssignee] = useState<(typeof ASSIGNEES)[number]>('')
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('')
  const [label, setLabel] = useState('')
  const [due, setDue] = useState<(typeof DUES)[number]>('')

  const criteria: FilterCriteria = {
    ...(assignee && { assignee }),
    ...(priority && { priority: Number(priority) }),
    ...(label.trim() && { label: label.trim() }),
    ...(due && { due })
  }

  return (
    <FormPanel
      title={t('filters.new')}
      onSubmit={event => {
        event.preventDefault()
        create.mutate(
          { name: name.trim(), criteria },
          {
            onSuccess: () => {
              setName('')
            }
          }
        )
      }}
      actions={
        <>
          {create.isError && (
            <Typography role="alert" variant="caption" color="error">
              {t('filters.saveFailed')}
            </Typography>
          )}
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
        label={t('filters.label')}
        value={label}
        onChange={event => {
          setLabel(event.target.value)
        }}
        slotProps={{ htmlInput: { maxLength: 50 } }}
      />
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
