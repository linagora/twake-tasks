import {
  Eye,
  Filter,
  Icon,
  Left,
  Plus,
  Star,
  StarOutline
} from '@linagora/twake-icons'
import {
  Button,
  Divider,
  IconButton,
  Link,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemSecondaryAction,
  ListItemText,
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
  Link as RouterLink,
  useHref,
  useLinkClickHandler,
  useLocation,
  useNavigate,
  useParams
} from 'react-router'

import type {
  FilterCriteria,
  NewSavedFilter,
  SavedFilter
} from '@/application/boards'
import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import { FieldRow, PlainForm } from '@/ds/FormPanel'
import { IconPicker } from '@/ds/IconPicker'
import { PageHeader } from '@/ds/PageHeader'
import { DEFAULT_VIEW_ICON, viewIcon } from '@/ds/viewIcons'
import { CriteriaFields } from '@/ui/agenda/CriteriaFields'
import { useCriteriaSummary } from '@/ui/agenda/useCriteriaSummary'
import { ViewMenu } from '@/ui/agenda/ViewMenu'
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
  useDocumentTitle(t('filters.title'))
  const summary = useCriteriaSummary()

  return (
    <main className="u-p-2">
      <PageCrumbs
        origin={{ icon: Filter, label: t('filters.title'), to: '/filters' }}
      />
      <div className="u-flex u-flex-items-center u-flex-justify-between u-mb-2">
        <Typography variant="h3" component="h1">
          {t('filters.title')}
        </Typography>
        <Button
          component={RouterLink}
          to="/filters/new"
          startIcon={<Icon icon={Plus} />}
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
        <ViewMenu view={filter} from="/filters" />
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

export function NewViewScreen(): ReactElement {
  const { t } = useI18n()
  const navigate = useNavigate()
  const create = useCreateFilter()
  useDocumentTitle(t('filters.new'))
  return (
    <ViewForm
      title={t('filters.new')}
      back="/filters"
      submitLabel={t('filters.save')}
      pending={create.isPending}
      failed={create.isError}
      onSave={view => {
        create.mutate(view, {
          onSuccess: ({ id }) => {
            void navigate(`/filters/${id}`, { replace: true })
          }
        })
      }}
    />
  )
}

const cameFrom = (state: unknown): string | null =>
  typeof state === 'object' &&
  state !== null &&
  'from' in state &&
  typeof state.from === 'string' &&
  state.from.startsWith('/')
    ? state.from
    : null

export function EditViewScreen(): ReactElement {
  const { t } = useI18n()
  const { filterId = '' } = useParams()
  const filters = useFilters()
  const view = filters.data?.find(filter => filter.id === filterId)
  const update = useUpdateFilter(filterId)
  // Back where the edit was opened from: the view, or the list of views.
  const location = useLocation()
  const from = cameFrom(location.state as unknown) ?? '/filters'
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
    <ViewForm
      key={view.id}
      title={t('filters.edit')}
      back={from}
      initial={view}
      autosave={update.isPending ? 'saving' : update.isSuccess && 'saved'}
      pending={update.isPending}
      failed={update.isError}
      onSave={edit => {
        update.mutate(edit)
      }}
    />
  )
}

// A view's edits are saved a moment after the last one, or on leaving.
const AUTOSAVE_DELAY = 600

// The page that creates a view or edits one: its icon, name and criteria. A
// view is created with a button; once it is, each change is saved as it is
// made.
function ViewForm({
  title,
  back,
  initial,
  submitLabel,
  autosave,
  pending,
  failed,
  onSave
}: {
  title: string
  back: string
  initial?: SavedFilter
  /** Without autosave, the view is created with the button of this label. */
  submitLabel?: string
  /** With, edits are saved as made, and this says how the last one went. */
  autosave?: 'saving' | 'saved' | false
  pending: boolean
  failed: boolean
  onSave: (view: NewSavedFilter) => void
}): ReactElement {
  const { t } = useI18n()
  const formId = useId()
  const creating = initial === undefined
  const [icon, setIcon] = useState(initial?.icon ?? DEFAULT_VIEW_ICON)
  const [name, setName] = useState(initial?.name ?? '')
  const [criteria, setCriteria] = useState<FilterCriteria>(
    initial?.criteria ?? {}
  )
  const view = { name: name.trim(), criteria, icon }
  const nameInput = useRef<HTMLInputElement | null>(null)
  // Stable, as focusOnMount is, so that it focuses on mount only.
  const nameRef = useCallback((node: HTMLInputElement | null) => {
    nameInput.current = node
    focusOnMount(node)
  }, [])
  const [nameMissing, setNameMissing] = useState(false)
  // Edits wait for a name, so their field asks for it as soon as it is empty.
  const nameError = nameMissing || (!creating && !view.name)
  const unsaved = useRef<NewSavedFilter | null>(null)
  const save = useRef(onSave)
  useEffect(() => {
    save.current = onSave
  })
  const edited = JSON.stringify(view)
  const first = useRef(edited)
  useEffect(() => {
    if (creating || edited === first.current) return
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
  }, [creating, edited])
  // Leaving the page saves the edit still waiting.
  useEffect(
    () => () => {
      if (unsaved.current) save.current(unsaved.current)
    },
    []
  )

  return (
    <main className="u-p-2">
      <Link
        component={RouterLink}
        to={back}
        variant="body2"
        color="textSecondary"
        underline="hover"
        className="u-flex u-flex-items-center"
      >
        <Icon icon={Left} size={12} className="u-mr-half" />
        {t(back === '/filters' ? 'filters.back' : 'filters.backToView')}
      </Link>
      {/* A view is created from the header, where its edits say they saved. */}
      <PageHeader
        title={
          <Typography variant="h3" component="h1" className="u-mt-1">
            {title}
          </Typography>
        }
        actions={
          creating ? (
            <>
              {failed && (
                <Typography role="alert" variant="caption" color="error">
                  {t('filters.saveFailed')}
                </Typography>
              )}
              <Button
                type="submit"
                form={formId}
                startIcon={<Icon icon={Plus} />}
                disabled={pending}
              >
                {submitLabel}
              </Button>
            </>
          ) : failed ? (
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
        id={formId}
        onSubmit={event => {
          event.preventDefault()
          if (!creating) return
          // A view needs a name, which its field asks for.
          if (!view.name) {
            setNameMissing(true)
            nameInput.current?.focus()
            return
          }
          onSave(view)
        }}
      >
        <FieldRow>
          <IconPicker
            value={icon}
            onChange={setIcon}
            labels={{
              button: t('icon.change'),
              title: t('icon.title'),
              search: t('icon.search'),
              noResult: t('icon.noResult')
            }}
          />
          <TextField
            label={t('filters.name')}
            value={name}
            fullWidth
            required
            error={nameError}
            helperText={nameError && t('filters.nameRequired')}
            inputRef={nameRef}
            onChange={event => {
              setName(event.target.value)
              if (event.target.value.trim()) setNameMissing(false)
            }}
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
        </FieldRow>
        <CriteriaFields criteria={criteria} onChange={setCriteria} />
      </PlainForm>
    </main>
  )
}
