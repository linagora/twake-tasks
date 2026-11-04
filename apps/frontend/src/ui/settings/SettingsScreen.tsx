import {
  Copy,
  Dots,
  Gear,
  Pen,
  Plus,
  Trash,
  WarningCircle
} from '@linagora/twake-icons'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  Typography
} from '@linagora/twake-mui'
import { useId, useState, type ReactElement } from 'react'

import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import { Icon } from '@/ds/Icon'
import { IconMenuItem } from '@/ds/IconMenuItem'
import { PageHeader } from '@/ds/PageHeader'
import { RowButton, TaskGroup, TaskRow } from '@/ds/TaskList'
import type { Project } from '@/application/boards'
import { editsProject, type Template } from '@/domain/board'
import { PageCrumbs } from '@/ui/boards/Crumbs'
import { useProjectName } from '@/ui/boards/BoardsScreen'
import { useI18n } from '@/ui/i18n/useI18n'
import { useProjects } from '@/ui/queries/boards'
import { useDeleteTemplate, useTemplates } from '@/ui/queries/templates'
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
      <TemplateSettings />
    </main>
  )
}

interface Group {
  key: string
  label: string
  templates: Template[]
  editable: boolean
}

function TemplateSettings(): ReactElement {
  const { t } = useI18n()
  const headingId = useId()
  const templates = useTemplates()
  const projects = useProjects()
  const projectName = useProjectName()
  const [editing, setEditing] = useState<Template | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Template | null>(null)
  const editable = (projects.data ?? []).filter(editsProject)
  const groups = groupsOf(
    templates.data ?? [],
    projects.data ?? [],
    t('templates.mine'),
    projectName
  )
  const failed = templates.isError || projects.isError

  return (
    <Box component="section" aria-labelledby={headingId}>
      <PageHeader
        title={
          <>
            <Typography id={headingId} variant="h5" component="h2">
              {t('templates.title')}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {t('templates.hint')}
            </Typography>
          </>
        }
        actions={
          <Button
            startIcon={<Icon icon={Plus} />}
            onClick={() => {
              setEditing('new')
            }}
          >
            {t('templates.new')}
          </Button>
        }
      />
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
      {!failed && (templates.isPending || projects.isPending) && (
        <ListSkeleton label={t('app.loading')} rows={2} />
      )}
      {!failed && templates.data?.length === 0 && (
        <EmptyState
          icon={Copy}
          illustrated
          title={t('templates.empty')}
          text={t('templates.emptyHint')}
        />
      )}
      {!failed &&
        groups.map(group => (
          <TaskGroup
            key={group.key}
            label={group.label}
            count={group.templates.length}
            heading="h3"
          >
            {group.templates.map(template => (
              <TemplateRow
                key={template.id}
                template={template}
                editable={group.editable}
                onEdit={() => {
                  setEditing(template)
                }}
                onDelete={() => {
                  setDeleting(template)
                }}
              />
            ))}
          </TaskGroup>
        ))}
      {editing && (
        <TemplateDialog
          template={editing === 'new' ? undefined : editing}
          projects={editable}
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
    </Box>
  )
}

// The person's own first, then each project's by name.
function groupsOf(
  templates: Template[],
  projects: Project[],
  mine: string,
  projectName: (project: Project) => string
): Group[] {
  const own = templates.filter(template => template.projectId === null)
  return [
    ...(own.length > 0
      ? [{ key: 'mine', label: mine, templates: own, editable: true }]
      : []),
    ...projects
      .map(project => ({
        key: project.id,
        label: projectName(project),
        templates: templates.filter(
          template => template.projectId === project.id
        ),
        editable: editsProject(project)
      }))
      .filter(group => group.templates.length > 0)
      .sort((a, b) => a.label.localeCompare(b.label))
  ]
}

function TemplateRow({
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
  const { t } = useI18n()
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
    <TaskRow
      label={template.title}
      leading={<Icon icon={Copy} size={16} />}
      title={
        editable ? (
          <RowButton onClick={onEdit}>{template.title}</RowButton>
        ) : (
          template.title
        )
      }
      context={facts.length > 0 ? facts.join(' · ') : t('templates.titleOnly')}
      trailing={
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
