import { Flag, Folder, Label, Pen, People } from '@linagora/twake-icons'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  Stack,
  TextField,
  Typography
} from '@linagora/twake-mui'
import { skipToken, useQuery } from '@tanstack/react-query'
import { useId, useState, type ReactElement } from 'react'

import { ApiError } from '@/application/boards'
import { ClosableTitle } from '@/ds/ClosableTitle'
import { LabelChip } from '@/ds/Columns'
import { DiscardDialog } from '@/ds/DiscardDialog'
import { Icon } from '@/ds/Icon'
import { RichTextEditor } from '@/ds/RichText'
import { Inline, Properties, Property, PropertySelect } from '@/ds/SidePanel'
import type { Priority, ProjectSummary, Template } from '@/domain/board'
import { displayName } from '@/domain/person'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { LabelsMenu } from '@/ui/boards/LabelsMenu'
import { PeopleMenu } from '@/ui/boards/PeopleMenu'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import { PriorityChip } from '@/ui/boards/TaskFacts'
import { MAX_DESCRIPTION } from '@/ui/boards/TaskPanel'
import { useRichTextLabels } from '@/ui/boards/useRichTextLabels'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'
import { useBoards } from '@/ui/queries/boards'
import { keys } from '@/ui/queries/keys'
import { useSaveTemplate } from '@/ui/queries/templates'

const PRIORITIES: Priority[] = [1, 2, 3, 4]
const MINE = ''

const toggled = (ids: string[], id: string): string[] =>
  ids.includes(id) ? ids.filter(each => each !== id) : [...ids, id]

// A project's labels and members are read from one of its boards, which all
// share them.
function useProjectBoard(projectId: string | null) {
  const api = useBoardsApi()
  const boards = useBoards().data?.filter(
    board => board.project.id === projectId
  )
  const boardId = (boards?.find(board => !board.archived) ?? boards?.[0])?.id
  return useQuery({
    queryKey: keys.board(boardId ?? ''),
    queryFn: boardId ? () => api.getBoard(boardId) : skipToken
  }).data
}

/**
 * Edits a template, or with none makes one, in one of the person's own
 * templates or in a project they edit.
 */
export function TemplateDialog({
  template,
  projects,
  projectName,
  onClose
}: {
  template?: Template | undefined
  /** The projects the person edits. */
  projects: ProjectSummary[]
  projectName: (project: ProjectSummary) => string
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const whereId = useId()
  const priorityId = useId()
  const richTextLabels = useRichTextLabels()
  const save = useSaveTemplate()
  const [projectId, setProjectId] = useState(template?.projectId ?? null)
  const [title, setTitle] = useState(template?.title ?? '')
  const [untitled, setUntitled] = useState(false)
  const [description, setDescription] = useState(template?.description ?? '')
  const [priority, setPriority] = useState(template?.priority ?? null)
  const [labelIds, setLabelIds] = useState(template?.labelIds ?? [])
  const [assigneeIds, setAssigneeIds] = useState(template?.assigneeIds ?? [])
  const [menu, setMenu] = useState<{
    name: 'members' | 'labels'
    anchor: HTMLElement
  } | null>(null)
  const [asking, setAsking] = useState(false)
  const board = useProjectBoard(projectId)
  const members = board?.members ?? []
  const labels = board?.labels ?? []
  const assignees = members.filter(each => assigneeIds.includes(each.userId))
  const checkedLabels = labels.filter(each => labelIds.includes(each.id))
  const changed =
    title !== (template?.title ?? '') ||
    description !== (template?.description ?? '') ||
    priority !== (template?.priority ?? null) ||
    labelIds.join() !== (template?.labelIds ?? []).join() ||
    assigneeIds.join() !== (template?.assigneeIds ?? []).join()
  const refused =
    save.error instanceof ApiError &&
    (save.error.code === 'invalid_label' ||
      save.error.code === 'invalid_assignee')

  const close = () => {
    if (save.isPending) return
    if (changed) setAsking(true)
    else onClose()
  }
  const submit = () => {
    if (save.isPending) return
    if (!title.trim()) {
      setUntitled(true)
      return
    }
    if (description.length > MAX_DESCRIPTION) return
    save.mutate(
      {
        templateId: template?.id,
        projectId,
        fields: {
          title: title.trim(),
          description,
          priority,
          labelIds: projectId === null ? [] : labelIds,
          assigneeIds: projectId === null ? [] : assigneeIds
        }
      },
      { onSuccess: onClose }
    )
  }
  const owner = projects.find(project => project.id === projectId)
  // A personal project is the person's alone, as their own templates are.
  const targets = projects.filter(project => !project.personal)

  return (
    <Dialog open onClose={close} aria-labelledby={titleId} size="medium">
      <form
        noValidate
        onSubmit={event => {
          event.preventDefault()
          submit()
        }}
      >
        <ClosableTitle
          id={titleId}
          title={t(template ? 'templates.editTitle' : 'templates.new')}
          closeLabel={t('templates.close')}
          onClose={close}
        />
        <DialogContent>
          <Stack spacing={2}>
            <TextField
              label={t('templates.name')}
              value={title}
              onChange={event => {
                save.reset()
                setTitle(event.target.value)
                setUntitled(false)
              }}
              error={untitled}
              helperText={
                untitled ? t('templates.nameRequired') : t('templates.nameHint')
              }
              fullWidth
              inputRef={focusOnMount}
              slotProps={{
                htmlInput: { maxLength: 500, 'aria-required': true }
              }}
            />
            <RichTextEditor
              label={t('newTask.description')}
              initial={description}
              placeholder={t('templates.descriptionPlaceholder')}
              labels={richTextLabels}
              minHeight={120}
              onChange={setDescription}
              onSubmit={submit}
            />
            <Properties ownWidth>
              <Property
                id={whereId}
                icon={<Icon icon={Folder} />}
                label={t('templates.where')}
              >
                {template || targets.length === 0 ? (
                  <Typography variant="body2">
                    {owner ? projectName(owner) : t('templates.onlyMe')}
                  </Typography>
                ) : (
                  <PropertySelect
                    labelId={whereId}
                    value={projectId ?? MINE}
                    options={[
                      { value: MINE, label: t('templates.onlyMe') },
                      ...targets.map(project => ({
                        value: project.id,
                        label: projectName(project)
                      }))
                    ]}
                    onChange={value => {
                      setProjectId(value === MINE ? null : value)
                      setLabelIds([])
                      setAssigneeIds([])
                    }}
                  />
                )}
              </Property>
              <Property
                id={priorityId}
                icon={<Icon icon={Flag} />}
                label={t('task.priority')}
              >
                <PropertySelect
                  labelId={priorityId}
                  value={priority === null ? '' : String(priority)}
                  options={[null, ...PRIORITIES].map(level => ({
                    value: level === null ? '' : String(level),
                    label:
                      level === null ? (
                        t('task.noPriority')
                      ) : (
                        <PriorityChip priority={level} />
                      )
                  }))}
                  onChange={value => {
                    setPriority(
                      PRIORITIES.find(level => String(level) === value) ?? null
                    )
                  }}
                />
              </Property>
              {projectId !== null && (
                <>
                  <Property
                    icon={<Icon icon={People} />}
                    label={t('task.assignees')}
                  >
                    {assignees.map(person => (
                      <Inline key={person.userId}>
                        <PersonAvatar
                          email={person.email}
                          name={person.name}
                          avatar={person.avatar}
                        />
                        <Typography variant="body2">
                          {displayName(person)}
                        </Typography>
                      </Inline>
                    ))}
                    {assignees.length === 0 && (
                      <Typography variant="body2" color="textSecondary">
                        {t('task.nobody')}
                      </Typography>
                    )}
                    {board && (
                      <IconButton
                        size="small"
                        aria-label={t('task.addAssignees')}
                        aria-haspopup="dialog"
                        onClick={event => {
                          setMenu({
                            name: 'members',
                            anchor: event.currentTarget
                          })
                        }}
                      >
                        <Icon icon={Pen} size={14} />
                      </IconButton>
                    )}
                  </Property>
                  <Property
                    icon={<Icon icon={Label} />}
                    label={t('task.labels')}
                  >
                    {checkedLabels.map(each => (
                      <LabelChip
                        key={each.id}
                        name={each.name}
                        color={each.color}
                      />
                    ))}
                    {checkedLabels.length === 0 && (
                      <Typography variant="body2" color="textSecondary">
                        {t('task.noLabels')}
                      </Typography>
                    )}
                    {board && (
                      <IconButton
                        size="small"
                        aria-label={t('task.addLabels')}
                        aria-haspopup="dialog"
                        onClick={event => {
                          setMenu({
                            name: 'labels',
                            anchor: event.currentTarget
                          })
                        }}
                      >
                        <Icon icon={Pen} size={14} />
                      </IconButton>
                    )}
                  </Property>
                </>
              )}
            </Properties>
            <Typography variant="caption" color="textSecondary">
              {t(
                projectId === null
                  ? 'templates.mineHint'
                  : 'templates.projectHint'
              )}
            </Typography>
            {save.isError && (
              <Typography role="alert" variant="body2" color="error">
                {t(refused ? 'templates.refused' : 'templates.saveFailed')}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={close}>
            {t('board.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={save.isPending || description.length > MAX_DESCRIPTION}
          >
            {t(template ? 'templates.save' : 'templates.create')}
          </Button>
        </DialogActions>
      </form>
      {asking && (
        <DiscardDialog
          labels={{
            title: t('task.discardTitle'),
            keep: t('task.keepEditing'),
            discard: t('task.discard')
          }}
          onKeep={() => {
            setAsking(false)
          }}
          onDiscard={onClose}
        />
      )}
      {menu?.name === 'members' && board && (
        <PeopleMenu
          label={t('templates.assignTitle')}
          boardId={board.id}
          members={members}
          tasks={board.tasks}
          shareable={false}
          pinned={new Set()}
          chosen={new Set(assigneeIds)}
          onToggle={userId => {
            save.reset()
            setAssigneeIds(toggled(assigneeIds, userId))
          }}
          anchor={menu.anchor}
          onClose={() => {
            setMenu(null)
          }}
        />
      )}
      {menu?.name === 'labels' && board && (
        <LabelsMenu
          label={t('templates.labelTitle')}
          boardId={board.id}
          labels={labels}
          chosen={new Set(labelIds)}
          onToggle={labelId => {
            save.reset()
            setLabelIds(toggled(labelIds, labelId))
          }}
          onCreated={labelId => {
            setLabelIds([...labelIds, labelId])
          }}
          anchor={menu.anchor}
          onClose={() => {
            setMenu(null)
          }}
        />
      )}
    </Dialog>
  )
}
