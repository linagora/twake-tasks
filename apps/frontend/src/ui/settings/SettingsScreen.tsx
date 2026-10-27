import {
  Down,
  Folder,
  Gear,
  Icon,
  Pen,
  Plus,
  Star,
  Trash,
  Up
} from '@linagora/twake-icons'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  ListItem,
  ListItemIcon,
  ListItemText,
  TextField,
  Tooltip,
  Typography
} from '@linagora/twake-mui'
import {
  Fragment,
  useId,
  useState,
  type ElementType,
  type ReactElement
} from 'react'

import type { SidebarSection } from '@/application/boards'
import { movedSection } from '@/application/sidebarSections'
import { ClosableTitle } from '@/ds/ClosableTitle'
import { ListSection } from '@/ds/ListSection'
import { SubMenuActionGap } from '@/ds/SubMenu'
import { PageCrumbs } from '@/ui/boards/Crumbs'
import {
  useCreateSidebarSection,
  useDeleteSidebarSection,
  useRenameSidebarSection,
  useSaveSidebarLayout,
  useSidebarSections
} from '@/ui/boards/queries'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'
import { useNameOf } from '@/ui/shell/SidebarSections'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

/** The settings of the app, reached from the gear of the top bar. */
export function SettingsScreen(): ReactElement {
  const { t } = useI18n()
  useDocumentTitle(t('settings.title'))

  return (
    <main className="u-ph-2 u-pt-half u-pb-2">
      <PageCrumbs
        origin={{ icon: Gear, label: t('settings.title'), to: '/settings' }}
        heading
      />
      <SidebarSectionsSettings />
    </main>
  )
}

/**
 * The sections of the sidebar, in its order: added, renamed, moved and
 * deleted here, Favorites being there to stay.
 */
function SidebarSectionsSettings(): ReactElement {
  const { t } = useI18n()
  const sections = useSidebarSections()
  const nameOf = useNameOf()
  const save = useSaveSidebarLayout()
  const [creating, setCreating] = useState(false)
  const all = sections.data ?? []

  return (
    <ListSection
      title={t('settings.sections')}
      action={
        <Tooltip disableInteractive title={t('settings.newSection')}>
          <IconButton
            size="small"
            aria-label={t('settings.newSection')}
            onClick={() => {
              setCreating(true)
            }}
          >
            <Icon icon={Plus} />
          </IconButton>
        </Tooltip>
      }
    >
      {sections.isError && (
        <Typography component="li" role="alert">
          {t('sidebar.failed')}
        </Typography>
      )}
      {all.map((section, index) => (
        <Fragment key={section.id}>
          {index > 0 && <Divider component="li" variant="inset" />}
          <SectionRow
            section={section}
            name={nameOf(section)}
            first={index === 0}
            last={index === all.length - 1}
            onMove={offset => {
              save.mutate(movedSection(all, section.id, offset))
            }}
          />
        </Fragment>
      ))}
      {save.isError && (
        <Typography component="li" role="alert" variant="body2" color="error">
          {t('sidebar.failed')}
        </Typography>
      )}
      {creating && (
        <NewSectionDialog
          onClose={() => {
            setCreating(false)
          }}
        />
      )}
    </ListSection>
  )
}

function SectionRow({
  section,
  name,
  first,
  last,
  onMove
}: {
  section: SidebarSection
  name: string
  first: boolean
  last: boolean
  onMove: (offset: -1 | 1) => void
}): ReactElement {
  const { t } = useI18n()
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null)
  const close = () => {
    setDialog(null)
  }

  return (
    <ListItem
      secondaryAction={
        <>
          <RowAction
            icon={Up}
            label={t('settings.moveUp', { name })}
            disabled={first}
            onClick={() => {
              onMove(-1)
            }}
          />
          <RowAction
            icon={Down}
            label={t('settings.moveDown', { name })}
            disabled={last}
            onClick={() => {
              onMove(1)
            }}
          />
          <RowAction
            icon={Pen}
            label={t('sidebar.renameSection', { name })}
            onClick={() => {
              setDialog('rename')
            }}
          />
          {/* Favorites stays, as the place of the favorites in no other. */}
          {section.favorites ? (
            <SubMenuActionGap disabled aria-hidden>
              <Icon icon={Trash} />
            </SubMenuActionGap>
          ) : (
            <RowAction
              icon={Trash}
              label={t('sidebar.deleteSection', { name })}
              onClick={() => {
                setDialog('delete')
              }}
            />
          )}
        </>
      }
    >
      <ListItemIcon>
        <Icon icon={section.favorites ? Star : Folder} />
      </ListItemIcon>
      <ListItemText
        primary={name}
        secondary={
          section.favorites
            ? t('settings.favoritesHint')
            : t('settings.items', { smart_count: section.items.length })
        }
      />
      {dialog === 'rename' && (
        <RenameSectionDialog section={section} name={name} onClose={close} />
      )}
      {dialog === 'delete' && (
        <DeleteSectionDialog section={section} name={name} onClose={close} />
      )}
    </ListItem>
  )
}

function RowAction({
  icon,
  label,
  disabled = false,
  onClick
}: {
  icon: ElementType
  label: string
  disabled?: boolean
  onClick: () => void
}): ReactElement {
  const button = (
    <IconButton aria-label={label} disabled={disabled} onClick={onClick}>
      <Icon icon={icon} />
    </IconButton>
  )
  // A disabled button has no events for its tooltip.
  return disabled ? (
    button
  ) : (
    <Tooltip disableInteractive title={label}>
      {button}
    </Tooltip>
  )
}

function NewSectionDialog({ onClose }: { onClose: () => void }): ReactElement {
  const { t } = useI18n()
  const create = useCreateSidebarSection()
  return (
    <SectionNameDialog
      title={t('settings.newSection')}
      submitLabel={t('sidebar.create')}
      pending={create.isPending}
      failed={create.isError}
      onClose={onClose}
      onSubmit={name => {
        create.mutate(name, { onSuccess: onClose })
      }}
    />
  )
}

function RenameSectionDialog({
  section,
  name,
  onClose
}: {
  section: SidebarSection
  name: string
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const rename = useRenameSidebarSection()
  return (
    <SectionNameDialog
      title={t('sidebar.renameTitle')}
      initial={name}
      submitLabel={t('sidebar.save')}
      pending={rename.isPending}
      failed={rename.isError}
      onClose={onClose}
      onSubmit={newName => {
        rename.mutate(
          { sectionId: section.id, name: newName },
          { onSuccess: onClose }
        )
      }}
    />
  )
}

function DeleteSectionDialog({
  section,
  name,
  onClose
}: {
  section: SidebarSection
  name: string
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const remove = useDeleteSidebarSection()
  const titleId = useId()
  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId}>
      <DialogTitle id={titleId}>
        {t('sidebar.deleteTitle', { name })}
      </DialogTitle>
      <DialogContent>
        <Typography>{t('sidebar.deleteText')}</Typography>
      </DialogContent>
      <DialogActions>
        {remove.isError && (
          <Typography role="alert" variant="caption" color="error">
            {t('sidebar.failed')}
          </Typography>
        )}
        <Button variant="text" onClick={onClose}>
          {t('sidebar.cancel')}
        </Button>
        <Button
          color="error"
          startIcon={<Icon icon={Trash} />}
          disabled={remove.isPending}
          onClick={() => {
            remove.mutate(section.id, { onSuccess: onClose })
          }}
        >
          {t('sidebar.deleteConfirm')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function SectionNameDialog({
  title,
  initial = '',
  submitLabel,
  pending,
  failed,
  onClose,
  onSubmit
}: {
  title: string
  initial?: string
  submitLabel: string
  pending: boolean
  failed: boolean
  onClose: () => void
  onSubmit: (name: string) => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const [name, setName] = useState(initial)

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="small">
      <form
        onSubmit={event => {
          event.preventDefault()
          if (name.trim()) onSubmit(name.trim())
        }}
      >
        <ClosableTitle
          id={titleId}
          title={title}
          closeLabel={t('sidebar.close')}
          onClose={onClose}
        />
        <DialogContent>
          <TextField
            label={t('sidebar.name')}
            value={name}
            onChange={event => {
              setName(event.target.value)
            }}
            required
            fullWidth
            inputRef={focusOnMount}
            margin="dense"
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          {failed && (
            <Typography role="alert" variant="body2" color="error">
              {t('sidebar.failed')}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button type="submit" disabled={pending || !name.trim()}>
            {submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
