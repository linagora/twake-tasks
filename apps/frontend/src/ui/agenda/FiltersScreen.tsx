import {
  Bottom,
  CalendarToday,
  Dashboard,
  Eye,
  Flag,
  Icon,
  Label,
  Mosaic,
  People,
  Plus,
  Right,
  Star,
  StarOutline
} from '@linagora/twake-icons'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemSecondaryAction,
  ListItemText,
  Stack,
  Switch,
  TextField,
  Typography
} from '@linagora/twake-mui'
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
  type ReactElement
} from 'react'
import {
  Navigate,
  useHref,
  useLinkClickHandler,
  useNavigate,
  useParams,
  useSearchParams
} from 'react-router'

import type {
  FilterCriteria,
  NewSavedFilter,
  SavedFilter
} from '@/application/boards'
import { ClosableTitle } from '@/ds/ClosableTitle'
import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import { FieldRow, PlainForm } from '@/ds/FormPanel'
import { IconPicker } from '@/ds/IconPicker'
import { ListSection } from '@/ds/ListSection'
import { PageHeader } from '@/ds/PageHeader'
import { DEFAULT_VIEW_ICON, viewIcon, type IconComponent } from '@/ds/viewIcons'
import { GROUPINGS, LAYOUTS, type Grouping, type Layout } from '@/domain/board'
import { CriteriaFields } from '@/ui/agenda/CriteriaFields'
import { SettingPicker } from '@/ui/agenda/SettingPicker'
import { useCriteriaSummary } from '@/ui/agenda/useCriteriaSummary'
import { ViewMenu } from '@/ui/agenda/ViewMenu'
import { LAYOUT_ICONS } from '@/ui/boards/Layouts'
import {
  useCreateFilter,
  useFilters,
  useSetFilterFavorite,
  useUpdateFilter
} from '@/ui/boards/queries'
import { PageCrumbs } from '@/ui/boards/Crumbs'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'
import { NotFoundScreen } from '@/ui/shell/Problems'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

export function FiltersScreen(): ReactElement {
  const { t } = useI18n()
  const filters = useFilters()
  const [, setParams] = useSearchParams()
  useDocumentTitle(t('filters.title'))
  const summary = useCriteriaSummary()

  return (
    <main className="u-p-2">
      <PageCrumbs
        origin={{ icon: Eye, label: t('filters.title'), to: '/filters' }}
      />
      <div className="u-flex u-flex-items-center u-flex-justify-between u-mb-2">
        <Typography variant="h3" component="h1">
          {t('filters.title')}
        </Typography>
        <Button
          startIcon={<Icon icon={Plus} />}
          onClick={() => {
            setParams(
              current => {
                const next = new URLSearchParams(current)
                next.set('new', 'view')
                return next
              },
              { replace: true }
            )
          }}
        >
          {t('filters.new')}
        </Button>
      </div>
      {filters.isError && (
        <Typography role="alert">{t('filters.loadFailed')}</Typography>
      )}
      {filters.isPending && <ListSkeleton label={t('app.loading')} rows={2} />}
      {filters.data?.length === 0 && (
        <EmptyState
          icon={Eye}
          illustrated
          title={t('filters.empty')}
          text={t('filters.emptyHint')}
        />
      )}
      {filters.data && filters.data.length > 0 && (
        <List aria-label={t('filters.saved')}>
          {filters.data.map((filter, index) => (
            <Fragment key={filter.id}>
              {index > 0 && <Divider component="li" variant="inset" />}
              <ViewRow filter={filter} summary={summary(filter.criteria)} />
            </Fragment>
          ))}
        </List>
      )}
      <NewViewFromUrl />
    </main>
  )
}

// A row of a Twake list that is a link, which its types leave out.
const ListItemLink: ComponentType<
  ComponentProps<typeof ListItemButton> & { href: string }
> = ListItemButton

// A view in the list of views, a link to it with its star and menu at its end.
function ViewRow({
  filter,
  summary
}: {
  filter: SavedFilter
  summary: string
}): ReactElement {
  const to = `/filters/${filter.id}`
  const href = useHref(to)
  const open = useLinkClickHandler<HTMLDivElement>(to)
  return (
    <ListItemLink href={href} onClick={open} aria-label={filter.name}>
      <ListItemIcon>
        <Icon icon={viewIcon(filter.icon)} />
      </ListItemIcon>
      <ListItemText primary={filter.name} secondary={summary} />
      <ListItemSecondaryAction>
        <FavoriteButton filter={filter} />
        <ViewMenu view={filter} />
      </ListItemSecondaryAction>
    </ListItemLink>
  )
}

function FavoriteButton({ filter }: { filter: SavedFilter }): ReactElement {
  const { t } = useI18n()
  const setFavorite = useSetFilterFavorite()
  const button = useRef<HTMLButtonElement>(null)
  const pressed = useRef(false)

  // The list moves a toggled view, and moving a node drops its focus.
  useEffect(() => {
    if (!pressed.current) return
    pressed.current = false
    button.current?.focus()
  }, [filter.favorite])

  return (
    <IconButton
      ref={button}
      color={filter.favorite ? 'warning' : 'default'}
      aria-label={t(filter.favorite ? 'boards.unstar' : 'boards.star', {
        name: filter.name
      })}
      onClick={() => {
        if (setFavorite.isPending) return
        pressed.current = document.activeElement === button.current
        setFavorite.mutate(
          { filterId: filter.id, favorite: !filter.favorite },
          {
            onError: () => {
              pressed.current = false
            }
          }
        )
      }}
    >
      <Icon icon={filter.favorite ? Star : StarOutline} />
    </IconButton>
  )
}

/**
 * The dialog that creates a view, while the URL holds `?new=view`, so a link
 * opens it, as `?new=task` does the new task's. Created, the view opens.
 */
function NewViewFromUrl(): ReactElement | null {
  const [params, setParams] = useSearchParams()
  if (params.get('new') !== 'view') return null
  return (
    <NewViewDialog
      onClose={() => {
        setParams(
          current => {
            const next = new URLSearchParams(current)
            next.delete('new')
            return next
          },
          { replace: true }
        )
      }}
    />
  )
}

/** The old page of a new view, now its dialog over the list of views. */
export function NewViewScreen(): ReactElement {
  return <Navigate to="/filters?new=view" replace />
}

// As the new task dialog: a name, then the rest under Add details.
function NewViewDialog({ onClose }: { onClose: () => void }): ReactElement {
  const { t } = useI18n()
  const navigate = useNavigate()
  const create = useCreateFilter()
  const titleId = useId()
  const draft = useViewDraft()
  const [details, setDetails] = useState(false)
  const [nameMissing, setNameMissing] = useState(false)
  const nameInput = useRef<HTMLInputElement | null>(null)
  // Stable, as focusOnMount is, so that it focuses on mount only.
  const nameRef = useCallback((node: HTMLInputElement | null) => {
    nameInput.current = node
    focusOnMount(node)
  }, [])
  // Closed while creating, it would miss the view once created.
  const close = () => {
    if (!create.isPending) onClose()
  }

  const handleSubmit = () => {
    if (create.isPending) return
    // A view needs a name, which its field asks for.
    if (!draft.view.name) {
      setNameMissing(true)
      nameInput.current?.focus()
      return
    }
    create.mutate(draft.view, {
      onSuccess: ({ id }) => {
        void navigate(`/filters/${id}`, { replace: true })
      }
    })
  }

  return (
    <Dialog open onClose={close} aria-labelledby={titleId} size="medium">
      <form
        noValidate
        onSubmit={event => {
          event.preventDefault()
          handleSubmit()
        }}
      >
        <ClosableTitle
          id={titleId}
          title={t('filters.createTitle')}
          closeLabel={t('filters.close')}
          onClose={close}
        />
        <DialogContent>
          <Stack spacing={2}>
            <ViewNameRow
              draft={draft}
              error={nameMissing}
              inputRef={nameRef}
              onNamed={() => {
                setNameMissing(false)
              }}
            />
            <div>
              <Button
                variant="text"
                size="small"
                startIcon={<Icon icon={details ? Bottom : Right} size={14} />}
                aria-expanded={details}
                onClick={() => {
                  setDetails(!details)
                }}
              >
                {t(details ? 'filters.hideDetails' : 'filters.addDetails')}
              </Button>
            </div>
            {details && <ViewSettings draft={draft} />}
            {create.isError && (
              <Typography role="alert" variant="body2" color="error">
                {t('filters.saveFailed')}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="submit" disabled={create.isPending}>
            {t('filters.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export function EditViewScreen(): ReactElement {
  const { t } = useI18n()
  const { filterId = '' } = useParams()
  const filters = useFilters()
  const view = filters.data?.find(filter => filter.id === filterId)
  const update = useUpdateFilter(filterId)
  useDocumentTitle(t('filters.edit'))

  if (filters.isPending) {
    return <ListSkeleton label={t('app.loading')} rows={2} />
  }
  if (!view) {
    return (
      <NotFoundScreen
        title={t('filters.notFound')}
        back={{ to: '/filters', label: t('filters.back') }}
      />
    )
  }
  return (
    <EditViewForm
      key={view.id}
      initial={view}
      autosave={update.isPending ? 'saving' : update.isSuccess && 'saved'}
      failed={update.isError}
      onSave={edit => {
        update.mutate(edit)
      }}
    />
  )
}

// What a view's columns can be, named and drawn as the criteria are.
const GROUPINGS_SHOWN = {
  status: { name: 'viewTask.status', icon: Mosaic },
  board: { name: 'viewTask.board', icon: Dashboard },
  assignee: { name: 'filters.assignee', icon: People },
  priority: { name: 'filters.priority', icon: Flag },
  label: { name: 'filters.label', icon: Label },
  due: { name: 'filters.due', icon: CalendarToday }
} as const satisfies Record<Grouping, { name: string; icon: IconComponent }>

// A view's edits are saved a moment after the last one, or on leaving.
const AUTOSAVE_DELAY = 600

/** A view being made or edited: its fields, and the view they make. */
interface ViewDraft {
  icon: string
  setIcon: (icon: string) => void
  name: string
  setName: (name: string) => void
  layout: Layout
  setLayout: (layout: Layout) => void
  groupBy: Grouping
  setGroupBy: (groupBy: Grouping) => void
  allColumns: boolean
  setAllColumns: (allColumns: boolean) => void
  criteria: FilterCriteria
  setCriteria: (criteria: FilterCriteria) => void
  view: NewSavedFilter
}

function useViewDraft(initial?: SavedFilter): ViewDraft {
  const [icon, setIcon] = useState(initial?.icon ?? DEFAULT_VIEW_ICON)
  const [name, setName] = useState(initial?.name ?? '')
  const [layout, setLayout] = useState<Layout>(initial?.layout ?? 'list')
  const [groupBy, setGroupBy] = useState<Grouping>(initial?.groupBy ?? 'status')
  const [allColumns, setAllColumns] = useState(initial?.allColumns ?? false)
  const [criteria, setCriteria] = useState<FilterCriteria>(
    initial?.criteria ?? {}
  )
  return {
    icon,
    setIcon,
    name,
    setName,
    layout,
    setLayout,
    groupBy,
    setGroupBy,
    allColumns,
    setAllColumns,
    criteria,
    setCriteria,
    view: { name: name.trim(), criteria, icon, layout, groupBy, allColumns }
  }
}

// A view's icon beside its name, which it needs.
function ViewNameRow({
  draft,
  error,
  inputRef,
  onNamed
}: {
  draft: ViewDraft
  error: boolean
  inputRef: (node: HTMLInputElement | null) => void
  /** Once the name is not empty, as its error may wait for. */
  onNamed?: () => void
}): ReactElement {
  const { t } = useI18n()
  return (
    <FieldRow>
      <IconPicker
        value={draft.icon}
        onChange={draft.setIcon}
        labels={{
          button: t('icon.change'),
          title: t('icon.title'),
          search: t('icon.search'),
          noResult: t('icon.noResult')
        }}
      />
      <TextField
        label={t('filters.name')}
        value={draft.name}
        fullWidth
        required
        error={error}
        helperText={error && t('filters.nameRequired')}
        inputRef={inputRef}
        onChange={event => {
          draft.setName(event.target.value)
          if (event.target.value.trim()) onNamed?.()
        }}
        slotProps={{ htmlInput: { maxLength: 100 } }}
      />
    </FieldRow>
  )
}

// How a view shows its tasks, then which tasks it keeps to.
function ViewSettings({ draft }: { draft: ViewDraft }): ReactElement {
  const { t } = useI18n()
  const allColumnsId = useId()
  const { layout, groupBy } = draft
  return (
    <>
      <ListSection title={t('filters.display')}>
        <SettingPicker
          label={t('filters.layout')}
          value={layout}
          choices={LAYOUTS.map(each => ({
            value: each,
            name: t(`layout.${each}`),
            icon: LAYOUT_ICONS[each]
          }))}
          iconInButton
          onChange={draft.setLayout}
        />
        {/* A calendar puts tasks on their days, so it has no groups. */}
        {layout !== 'calendar' && (
          <SettingPicker
            label={t('filters.groupBy')}
            value={groupBy}
            choices={GROUPINGS.map(each => ({
              value: each,
              name: t(GROUPINGS_SHOWN[each].name),
              icon: GROUPINGS_SHOWN[each].icon
            }))}
            onChange={draft.setGroupBy}
          />
        )}
        {/* Only sections have columns no task is in. */}
        {layout !== 'calendar' && groupBy === 'status' && (
          <ListItem disableGutters ellipsis={false}>
            <ListItemIcon>
              <Icon icon={Eye} />
            </ListItemIcon>
            <ListItemText primary={t('filters.allColumns')} id={allColumnsId} />
            <Switch
              checked={draft.allColumns}
              slotProps={{
                input: { 'aria-labelledby': allColumnsId }
              }}
              onChange={event => {
                draft.setAllColumns(event.target.checked)
              }}
            />
          </ListItem>
        )}
      </ListSection>
      <CriteriaFields criteria={draft.criteria} onChange={draft.setCriteria} />
    </>
  )
}

// The page that edits a view: each change is saved as it is made.
function EditViewForm({
  initial,
  autosave,
  failed,
  onSave
}: {
  initial: SavedFilter
  /** How the last edit went. */
  autosave: 'saving' | 'saved' | false
  failed: boolean
  onSave: (view: NewSavedFilter) => void
}): ReactElement {
  const { t } = useI18n()
  const draft = useViewDraft(initial)
  const { view } = draft
  // Edits wait for a name, so its field asks for it as soon as it is empty.
  const nameError = !view.name
  const unsaved = useRef<NewSavedFilter | null>(null)
  const save = useRef(onSave)
  useEffect(() => {
    save.current = onSave
  })
  const edited = JSON.stringify(view)
  const first = useRef(edited)
  useEffect(() => {
    if (edited === first.current) return
    const next = JSON.parse(edited) as NewSavedFilter
    // A view keeps its name: one being typed waits until it has one.
    if (!next.name) return
    unsaved.current = next
    const timer = setTimeout(() => {
      unsaved.current = null
      save.current(next)
    }, AUTOSAVE_DELAY)
    return () => {
      clearTimeout(timer)
    }
  }, [edited])
  // Leaving the page saves the edit still waiting.
  useEffect(
    () => () => {
      if (unsaved.current) save.current(unsaved.current)
    },
    []
  )

  return (
    <main className="u-p-2">
      <PageCrumbs
        origin={{ icon: Eye, label: t('filters.title'), to: '/filters' }}
        steps={[{ to: `/filters/${initial.id}`, label: initial.name }]}
        current={t('filters.edit')}
      />
      {/* Its edits say in the header how they saved. */}
      <PageHeader
        title={
          <Typography variant="h3" component="h1">
            {t('filters.edit')}
          </Typography>
        }
        actions={
          failed ? (
            <Typography role="alert" variant="caption" color="error">
              {t('filters.saveFailed')}
            </Typography>
          ) : (
            autosave && (
              <Typography role="status" variant="caption" color="textSecondary">
                {t(
                  autosave === 'saving'
                    ? 'filters.saving'
                    : 'filters.changesSaved'
                )}
              </Typography>
            )
          )
        }
      />
      <PlainForm
        onSubmit={event => {
          event.preventDefault()
        }}
      >
        <ViewNameRow draft={draft} error={nameError} inputRef={focusOnMount} />
        <ViewSettings draft={draft} />
      </PlainForm>
    </main>
  )
}
