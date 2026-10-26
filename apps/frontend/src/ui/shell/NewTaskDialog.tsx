import {
  Bottom,
  CalendarToday,
  Flag,
  Folder,
  Icon,
  Label,
  Mosaic,
  People,
  Pen,
  Right
} from '@linagora/twake-icons'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DropdownButton,
  IconButton,
  Stack,
  TextField,
  Typography
} from '@linagora/twake-mui'
import { useCallback, useId, useRef, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'

import {
  defaultSection,
  UnfinishedTask,
  type NewTaskDraft,
  type StartedTask
} from '@/application/newTask'
import { ClosableTitle } from '@/ds/ClosableTitle'
import { LabelChip } from '@/ds/Columns'
import { DayPopover } from '@/ds/Pickers'
import { RichTextEditor } from '@/ds/RichText'
import { Inline, Properties, Property, PropertySelect } from '@/ds/SidePanel'
import { Toast } from '@/ds/Toast'
import { isShareable, type Priority } from '@/domain/board'
import { displayName } from '@/domain/person'
import { inDays, shortDay, untilNextMonday } from '@/ui/boards/dueLabel'
import { LabelsMenu } from '@/ui/boards/LabelsMenu'
import { PeopleMenu } from '@/ui/boards/PeopleMenu'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import { useNewTask, useNewTaskBoard } from '@/ui/boards/queries'
import { PriorityChip } from '@/ui/boards/TaskFacts'
import { MAX_DESCRIPTION } from '@/ui/boards/TaskPanel'
import { useRichTextLabels } from '@/ui/boards/useRichTextLabels'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'
import { useHighlightNewTask } from '@/ui/shell/NewTaskHighlight'
import { useNewTaskParam } from '@/ui/shell/useNewTaskParam'

const PRIORITIES: Priority[] = [1, 2, 3, 4]

type MenuName = 'members' | 'labels' | 'due'

const EMPTY: Omit<NewTaskDraft, 'title' | 'description'> = {
  assigneeIds: [],
  labelIds: [],
  dueDate: null,
  priority: null
}

const toggled = (ids: string[], id: string): string[] =>
  ids.includes(id) ? ids.filter(each => each !== id) : [...ids, id]

export interface CreatedTask {
  boardId: string
  key: string
  title: string
}

/**
 * The dialog, while the URL asks for it, then the alert saying the task was
 * created, with a link to it. The link is relative to the layout route, so it
 * stays in the app or in the project the embed shows.
 */
export function NewTaskFromUrl({
  inBoardId,
  inProjectId
}: {
  inBoardId?: string | undefined
  inProjectId?: string | undefined
}): ReactElement {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { creating, dueDate, closeNewTask } = useNewTaskParam()
  const [created, setCreated] = useState<CreatedTask | null>(null)
  const highlight = useHighlightNewTask()

  return (
    <>
      {creating && (
        <NewTaskDialog
          inBoardId={inBoardId}
          inProjectId={inProjectId}
          dueDate={dueDate}
          onClose={closeNewTask}
          onCreated={task => {
            closeNewTask()
            setCreated(task)
            highlight(task.key)
          }}
        />
      )}
      {created && (
        <Toast
          key={created.key}
          open
          autoHideDuration={4000}
          onClose={(_, reason) => {
            if (reason !== 'clickaway') setCreated(null)
          }}
        >
          <Alert
            severity="success"
            role="status"
            aria-label={t('newTask.created', { title: created.title })}
            action={
              <Button
                variant="text"
                size="small"
                onClick={() => {
                  setCreated(null)
                  void navigate(`boards/${created.boardId}?task=${created.key}`)
                }}
              >
                {t('newTask.seeTask')}
              </Button>
            }
          >
            {t('newTask.created', { title: created.title })}
          </Alert>
        </Toast>
      )}
    </>
  )
}

/**
 * Opened from a board, the task goes in that board unless another is picked,
 * else in the Inbox. Opened from a project, only its boards are offered.
 */
export function NewTaskDialog({
  inBoardId,
  inProjectId,
  dueDate,
  onClose,
  onCreated
}: {
  inBoardId?: string | undefined
  inProjectId?: string | undefined
  dueDate?: string | undefined
  onClose: () => void
  onCreated: (task: CreatedTask) => void
}): ReactElement {
  const { t, lang } = useI18n()
  const titleId = useId()
  const boardLabelId = useId()
  const sectionLabelId = useId()
  const priorityLabelId = useId()
  const richTextLabels = useRichTextLabels()
  const [title, setTitle] = useState('')
  const [untitled, setUntitled] = useState(false)
  const [description, setDescription] = useState('')
  const [details, setDetails] = useState(false)
  const [facts, setFacts] = useState({ ...EMPTY, dueDate: dueDate ?? null })
  const [picked, setPicked] = useState<string | undefined>(undefined)
  const [pickedSection, setPickedSection] = useState<string | undefined>(
    undefined
  )
  const [menu, setMenu] = useState<{
    name: MenuName
    anchor: HTMLElement
  } | null>(null)
  const titleRef = useRef<HTMLInputElement | null>(null)
  // Stable, or each render would take the focus back to the title.
  const titleInputRef = useCallback((element: HTMLInputElement | null) => {
    titleRef.current = element
    focusOnMount(element)
  }, [])
  const create = useNewTask()
  const [started, setStarted] = useState<StartedTask | undefined>(undefined)
  const { targets, chosen, board } = useNewTaskBoard(
    picked,
    inBoardId,
    inProjectId
  )

  const change = (changes: Partial<typeof facts>) => {
    if (!create.isIdle && !create.isPending) create.reset()
    setFacts(previous => ({ ...previous, ...changes }))
  }
  const open = (name: MenuName) => (event: { currentTarget: HTMLElement }) => {
    setMenu({ name, anchor: event.currentTarget })
  }
  const closeMenu = () => {
    setMenu(null)
  }
  const pickBoard = (boardId: string) => {
    if (boardId === chosen?.id) return
    setPicked(boardId)
    setPickedSection(undefined)
    // Members, labels and sections belong to the board they were picked in.
    change({ assigneeIds: [], labelIds: [] })
  }

  const sections = board?.sections ?? []
  const section =
    sections.find(each => each.id === pickedSection) ?? defaultSection(sections)

  // Closed while creating, it would miss the task once created.
  const close = () => {
    if (!create.isPending) onClose()
  }

  const handleSubmit = () => {
    // The description submits on Ctrl+Enter, past the disabled button.
    if (create.isPending) return
    if (!title.trim()) {
      setUntitled(true)
      titleRef.current?.focus()
      return
    }
    if (!chosen || description.length > MAX_DESCRIPTION) return
    create.mutate(
      {
        boardId: chosen.id,
        draft: {
          ...facts,
          title,
          description,
          ...(section && { sectionId: section.id })
        },
        started
      },
      {
        onSuccess: task => {
          onCreated({ ...task, title: title.trim() })
        },
        // Create disables itself while the request runs, which drops the
        // focus to the page.
        onError: error => {
          if (error instanceof UnfinishedTask) setStarted(error.task)
          titleRef.current?.focus()
        }
      }
    )
  }

  const members = board?.members ?? []
  const labels = board?.labels ?? []
  const assignees = members.filter(each =>
    facts.assigneeIds.includes(each.userId)
  )
  const checkedLabels = labels.filter(each => facts.labelIds.includes(each.id))
  const due = facts.dueDate ? shortDay(facts.dueDate, lang) : t('dates.noDate')
  const dayPicks = [
    { label: t('dates.today'), day: inDays(0) },
    { label: t('dates.tomorrow'), day: inDays(1) },
    { label: t('dates.nextWeek'), day: inDays(untilNextMonday()) },
    { label: t('dates.noDate'), day: '' }
  ]

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
          title={t('newTask.title')}
          closeLabel={t('newTask.close')}
          onClose={close}
        />
        <DialogContent>
          <Stack spacing={2}>
            <TextField
              placeholder={t('newTask.taskTitle')}
              value={title}
              onChange={event => {
                if (!create.isIdle && !create.isPending) create.reset()
                setTitle(event.target.value)
                setUntitled(false)
              }}
              error={untitled}
              helperText={untitled ? t('newTask.titleRequired') : undefined}
              fullWidth
              inputRef={titleInputRef}
              slotProps={{
                htmlInput: {
                  maxLength: 500,
                  'aria-label': t('newTask.taskTitle'),
                  'aria-required': true
                }
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
                {t(details ? 'newTask.hideDetails' : 'newTask.addDetails')}
              </Button>
            </div>
            {details && (
              <>
                <RichTextEditor
                  label={t('newTask.description')}
                  initial={description}
                  placeholder={t('newTask.descriptionPlaceholder')}
                  labels={richTextLabels}
                  minHeight={120}
                  onChange={setDescription}
                  onSubmit={handleSubmit}
                />
                <Properties ownWidth>
                  <Property
                    id={boardLabelId}
                    icon={<Icon icon={Mosaic} />}
                    label={t('newTask.board')}
                  >
                    {targets && chosen && (
                      <PropertySelect
                        labelId={boardLabelId}
                        value={chosen.id}
                        options={targets.map(each => ({
                          value: each.id,
                          label: each.name
                        }))}
                        onChange={pickBoard}
                        disabled={started !== undefined}
                      />
                    )}
                  </Property>
                  {section && (
                    <Property
                      id={sectionLabelId}
                      icon={<Icon icon={Folder} />}
                      label={t('newTask.section')}
                    >
                      <PropertySelect
                        labelId={sectionLabelId}
                        value={section.id}
                        options={sections.map(each => ({
                          value: each.id,
                          label: each.name
                        }))}
                        onChange={setPickedSection}
                        disabled={started !== undefined}
                      />
                    </Property>
                  )}
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
                        onClick={open('members')}
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
                        onClick={open('labels')}
                      >
                        <Icon icon={Pen} size={14} />
                      </IconButton>
                    )}
                  </Property>
                  <Property
                    icon={<Icon icon={CalendarToday} />}
                    label={t('newTask.dueDate')}
                  >
                    <DropdownButton
                      textVariant="body2"
                      aria-label={t('newTask.dueDateOf', { date: due })}
                      aria-haspopup="dialog"
                      onClick={open('due')}
                    >
                      {due}
                    </DropdownButton>
                  </Property>
                  <Property
                    id={priorityLabelId}
                    icon={<Icon icon={Flag} />}
                    label={t('task.priority')}
                  >
                    <PropertySelect
                      labelId={priorityLabelId}
                      value={
                        facts.priority === null ? '' : String(facts.priority)
                      }
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
                        change({
                          priority:
                            PRIORITIES.find(level => String(level) === value) ??
                            null
                        })
                      }}
                    />
                  </Property>
                </Properties>
              </>
            )}
            {targets?.length === 0 && (
              <Typography role="status" variant="body2" color="textSecondary">
                {t('newTask.nowhere')}
              </Typography>
            )}
            {create.isError && (
              <Typography role="alert" variant="body2" color="error">
                {t(started ? 'newTask.unfinished' : 'newTask.failed')}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            type="submit"
            disabled={
              create.isPending ||
              !chosen ||
              description.length > MAX_DESCRIPTION
            }
          >
            {t(started ? 'newTask.save' : 'newTask.create')}
          </Button>
        </DialogActions>
      </form>
      {menu?.name === 'members' && board && (
        <PeopleMenu
          label={t('newTask.membersTitle')}
          boardId={board.id}
          members={members}
          tasks={board.tasks}
          shareable={isShareable(board)}
          pinned={new Set()}
          chosen={new Set(facts.assigneeIds)}
          onToggle={userId => {
            change({ assigneeIds: toggled(facts.assigneeIds, userId) })
          }}
          anchor={menu.anchor}
          onClose={closeMenu}
        />
      )}
      {menu?.name === 'labels' && board && (
        <LabelsMenu
          label={t('newTask.labelsTitle')}
          boardId={board.id}
          labels={labels}
          chosen={new Set(facts.labelIds)}
          onToggle={labelId => {
            change({ labelIds: toggled(facts.labelIds, labelId) })
          }}
          onCreated={labelId => {
            change({ labelIds: [...facts.labelIds, labelId] })
          }}
          anchor={menu.anchor}
          onClose={closeMenu}
        />
      )}
      {menu?.name === 'due' && (
        <DayPopover
          label={t('newTask.dueDate')}
          anchor={menu.anchor}
          onClose={closeMenu}
          value={facts.dueDate ?? ''}
          onChange={day => {
            change({ dueDate: day || null })
            closeMenu()
          }}
          picks={dayPicks}
        />
      )}
    </Dialog>
  )
}
