import {
  Bell,
  Calendar,
  Copy,
  Dots,
  Gear,
  Pen,
  Plus,
  Trash,
  WarningCircle
} from '@linagora/twake-icons'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography
} from '@linagora/twake-mui'
import { useId, useState, type ReactElement } from 'react'

import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import { Icon } from '@/ds/Icon'
import { IconMenuItem } from '@/ds/IconMenuItem'
import { Menu } from '@/ds/Menu'
import { SettingsLayout } from '@/ds/SettingsLayout'
import { SettingsCard } from '@/ds/SettingsCard'
import { RowButton } from '@/ds/TaskList'
import { CardGroup, NewCard, TemplateCard } from '@/ds/TemplateCards'
import type { Project } from '@/application/boards'
import { editsProject, type Template } from '@/domain/board'
import { PageCrumbs } from '@/ui/boards/Crumbs'
import { useProjectName } from '@/ui/boards/BoardsScreen'
import { useI18n } from '@/ui/i18n/useI18n'
import { useProjects } from '@/ui/queries/boards'
import { useDeleteTemplate, useTemplates } from '@/ui/queries/templates'
import { CalendarFeedSettings } from '@/ui/settings/CalendarFeedSettings'
import { NotificationSettings } from '@/ui/settings/NotificationSettings'
import { scheduleSummary } from '@/ui/settings/scheduleSummary'
import { TemplateDialog } from '@/ui/settings/TemplateDialog'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

export function SettingsScreen(): ReactElement {
  const { t } = useI18n()
  useDocumentTitle(t('settings.title'))

  return (
    <main className="u-ph-2 u-pt-half u-pb-2">
      <PageCrumbs
        origin={{ icon: Gear, label: t('settings.title'), to: '/settings' }}
        heading
      />
      <SettingsLayout
        label={t('settings.sections')}
        sections={[
          {
            id: 'notifications',
            icon: Bell,
            label: t('notificationSettings.title')
          },
          { id: 'calendar', icon: Calendar, label: t('calendarFeed.title') },
          { id: 'templates', icon: Copy, label: t('templates.title') }
        ]}
      >
        <NotificationSettings />
        <CalendarFeedSettings />
        <TemplateSettings />
      </SettingsLayout>
    </main>
  )
}

interface Group {
  project: Project
  label: string
  templates: Template[]
  editable: boolean
}

/** The template to change, else a new one, in one of `projects`. */
interface Editing {
  template?: Template
  projects: Project[]
}

function TemplateSettings(): ReactElement {
  const { t } = useI18n()
  const templates = useTemplates()
  const projects = useProjects()
  const projectName = useProjectName()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [deleting, setDeleting] = useState<Template | null>(null)
  const editable = (projects.data ?? []).filter(editsProject)
  const groups = groupsOf(
    templates.data ?? [],
    projects.data ?? [],
    projectName
  )
  const failed = templates.isError || projects.isError
  const loading = templates.isPending || projects.isPending

  return (
    <SettingsCard
      id="templates"
      icon={Copy}
      title={t('templates.title')}
      hint={t('templates.hint')}
      aside={
        editable.length > 0 && (
          <Button
            startIcon={<Icon icon={Plus} />}
            onClick={() => {
              setEditing({ projects: editable })
            }}
          >
            {t('templates.new')}
          </Button>
        )
      }
    >
      {failed && (
        <EmptyState
          tone="error"
          icon={WarningCircle}
          title={t('templates.loadFailed')}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void templates.refetch()
                void projects.refetch()
              }}
            >
              {t('session.retry')}
            </Button>
          }
        />
      )}
      {!failed && loading && <ListSkeleton label={t('app.loading')} rows={2} />}
      {!failed && !loading && groups.length === 0 && (
        <EmptyState
          icon={Copy}
          illustrated
          title={t('templates.empty')}
          text={t('templates.emptyHint')}
        />
      )}
      {!failed &&
        groups.map(group => (
          <CardGroup
            key={group.project.id}
            label={group.label}
            count={group.templates.length}
          >
            {group.templates.map(template => (
              <TemplateItem
                key={template.id}
                template={template}
                editable={group.editable}
                onEdit={() => {
                  setEditing({ template, projects: editable })
                }}
                onDelete={() => {
                  setDeleting(template)
                }}
              />
            ))}
            {group.editable && (
              <NewCard
                label={t('templates.newIn', { name: group.label })}
                onClick={() => {
                  setEditing({ projects: [group.project] })
                }}
              />
            )}
          </CardGroup>
        ))}
      {editing && (
        <TemplateDialog
          template={editing.template}
          projects={editing.projects}
          projectName={projectName}
          onClose={() => {
            setEditing(null)
          }}
        />
      )}
      {deleting && (
        <DeleteTemplateDialog
          template={deleting}
          onClose={() => {
            setDeleting(null)
          }}
        />
      )}
    </SettingsCard>
  )
}

function groupsOf(
  templates: Template[],
  projects: Project[],
  projectName: (project: Project) => string
): Group[] {
  return projects
    .map(project => ({
      project,
      label: projectName(project),
      templates: templates.filter(
        template => template.projectId === project.id
      ),
      editable: editsProject(project)
    }))
    .filter(group => group.templates.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label))
}

function TemplateItem({
  template,
  editable,
  onEdit,
  onDelete
}: {
  template: Template
  editable: boolean
  onEdit: () => void
  onDelete: () => void
}): ReactElement {
  const { t, lang } = useI18n()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const choose = (action: () => void) => () => {
    setAnchor(null)
    action()
  }
  const facts = [
    template.priority !== null &&
      t('board.priority', { level: template.priority }),
    template.labelIds.length > 0 &&
      t('templates.labels', { smart_count: template.labelIds.length }),
    template.assigneeIds.length > 0 &&
      t('templates.assignees', { smart_count: template.assigneeIds.length }),
    template.description.trim() !== '' && t('templates.withDescription'),
    !editable && t('templates.viewOnly')
  ].filter(fact => fact !== false)

  return (
    <TemplateCard
      label={template.title}
      title={
        editable ? (
          <RowButton onClick={onEdit}>{template.title}</RowButton>
        ) : (
          template.title
        )
      }
      facts={facts.length > 0 ? facts.join(' · ') : t('templates.titleOnly')}
      schedule={
        template.schedule && {
          summary: scheduleSummary(t, lang, template.schedule),
          stopped:
            template.schedule.paused || template.schedule.pausedBy
              ? t('templates.schedule.paused')
              : template.schedule.nextRunAt === null
                ? t('templates.schedule.ended')
                : null
        }
      }
      menu={
        editable && (
          <>
            <IconButton
              size="small"
              aria-label={t('templates.options', { name: template.title })}
              aria-haspopup="menu"
              aria-expanded={anchor !== null}
              onClick={event => {
                setAnchor(event.currentTarget)
              }}
            >
              <Icon icon={Dots} />
            </IconButton>
            <Menu
              anchorEl={anchor}
              open={anchor !== null}
              onClose={() => {
                setAnchor(null)
              }}
            >
              <IconMenuItem icon={Pen} onClick={choose(onEdit)}>
                {t('templates.edit')}
              </IconMenuItem>
              <IconMenuItem icon={Trash} onClick={choose(onDelete)}>
                {t('templates.delete')}
              </IconMenuItem>
            </Menu>
          </>
        )
      }
    />
  )
}

function DeleteTemplateDialog({
  template,
  onClose
}: {
  template: Template
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const remove = useDeleteTemplate()

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="small">
      <form
        onSubmit={event => {
          event.preventDefault()
          remove.mutate(template, { onSuccess: onClose })
        }}
      >
        <DialogTitle id={titleId}>
          {t('templates.deleteTitle', { name: template.title })}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('templates.deleteHint')}</Typography>
          {remove.isError && (
            <Typography role="alert" variant="body2" color="error">
              {t('templates.deleteFailed')}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={onClose}>
            {t('board.cancel')}
          </Button>
          <Button type="submit" color="error" disabled={remove.isPending}>
            {t('templates.delete')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
