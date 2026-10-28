import {
  Bottom,
  CalendarToday,
  Flag,
  Folder,
  Label,
  Mosaic,
  People,
  Pen,
  Right
} from '@linagora/twake-icons'
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DropdownButton,
  FormControlLabel,
  IconButton,
  Stack,
  TextField,
  Typography
} from '@linagora/twake-mui'
import { useCallback, useId, useRef, useState, type ReactElement } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router'

import {
  defaultSection,
  UnfinishedTask,
  type NewTaskDraft,
  type StartedTask
} from '@/application/newTask'
import { ClosableTitle } from '@/ds/ClosableTitle'
import { LabelChip } from '@/ds/Columns'
import { DiscardDialog } from '@/ds/DiscardDialog'
import { Icon } from '@/ds/Icon'
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
import { useSession } from '@/ui/session/SessionGate'
import { useHighlightNewTask } from '@/ui/shell/NewTaskHighlight'
import { useNewTaskParam, type NewTaskPreset } from '@/ui/shell/useNewTaskParam'

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

const CREATE_ANOTHER = 'twake-tasks.createAnother'

export interface CreatedTask {
  boardId: string
  key: string
  title: string
  board: string
  /** Its preset date or assignee was changed, so it may not be on the page. */
  elsewhere: boolean
}

// Relative to the layout route, so it stays in the app or in the project the
// embed shows.
const taskPath = (task: CreatedTask) =>
  `boards/${task.boardId}?task=${task.key}`

/**
 * The dialog, while the URL asks for it, then the alert saying the task was
 * created, with a link to it.
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
  const { creating, preset, closeNewTask } = useNewTaskParam()
  const [created, setCreated] = useState<CreatedTask | null>(null)
  const highlight = useHighlightNewTask()
  const said =
    created &&
    t('newTask.createdIn', { title: created.title, board: created.board })

  return (
    <>
      {creating && (
        <NewTaskDialog
          inBoardId={inBoardId}
          inProjectId={inProjectId}
          preset={preset}
          onClose={closeNewTask}
          onCreated={(task, staysOpen) => {
            highlight(task.key)
            if (staysOpen) return
            closeNewTask()
            setCreated(task)
          }}
        />
      )}
      {created && (
        <Toast
          key={created.key}
          open
          // Longer when the task is not on the page, to leave time to see it.
          autoHideDuration={created.elsewhere ? 8000 : 4000}
          onClose={(_, reason) => {
            if (reason !== 'clickaway') setCreated(null)
          }}
        >
          <Alert
            severity="success"
            role="status"
            aria-label={said ?? undefined}
            action={
              <Button
                variant="text"
                size="small"
                onClick={() => {
                  setCreated(null)
                  void navigate(taskPath(created))
                }}
              >
                {t('newTask.seeTask')}
              </Button>
            }
          >
            {said}
          </Alert>
        </Toast>
      )}
    </>
  )
}

function useCreateAnother(): [boolean, (another: boolean) => void] {
  const [another, setAnother] = useState(() => {
    try {
      return localStorage.getItem(CREATE_ANOTHER) === 'true'
    } catch {
      return false
    }
  })
  const choose = (next: boolean) => {
    setAnother(next)
    try {
      localStorage.setItem(CREATE_ANOTHER, String(next))
    } catch {
      // Storage blocked: the choice lasts until the dialog closes.
    }
  }
  return [another, choose]
}

/**
 * Opened from a board, the task goes in that board unless another is picked,
 * else in the Inbox. Opened from a project, only its boards are offered.
 */
export function NewTaskDialog({
  inBoardId,
  inProjectId,
  preset,
  onClose,
  onCreated
}: {
  inBoardId?: string | undefined
  inProjectId?: string | undefined
  preset: NewTaskPreset
  onClose: () => void
  /** `staysOpen` for another task, else the dialog is to be closed. */
  onCreated: (task: CreatedTask, staysOpen: boolean) => void
}): ReactElement {
  const { t, lang } = useI18n()
  const { user } = useSession()
  const navigate = useNavigate()
  const titleId = useId()
  const boardLabelId = useId()
  const sectionLabelId = useId()
  const priorityLabelId = useId()
  const richTextLabels = useRichTextLabels()
  const [title, setTitle] = useState('')
  const [untitled, setUntitled] = useState(false)
  const [description, setDescription] = useState('')
  // Remounts the description editor, which only reads its initial text.
  const [cleared, setCleared] = useState(0)
  const [details, setDetails] = useState(false)
  const [facts, setFacts] = useState({
    ...EMPTY,
    dueDate: preset.dueDate ?? null
  })
  // Who "me" is among the members is known once the board is loaded.
  const [assignMe, setAssignMe] = useState(preset.assignToMe ?? false)
  const [another, setAnother] = useCreateAnother()
  const [last, setLast] = useState<CreatedTask | null>(null)
  const [asking, setAsking] = useState(false)
  const boardSelect = useRef<{ focus: () => void }>(null)
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
  const { targets, chosen, board, boardFailed } = useNewTaskBoard(
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
  const members = board?.members ?? []
  const me = members.find(
    each => each.email.toLowerCase() === user.email?.toLowerCase()
  )
  // Kept while another board loads: my id is the same in every board.
  const [myId, setMyId] = useState<string | undefined>(undefined)
  if (me && me.userId !== myId) setMyId(me.userId)
  if (assignMe && (board || boardFailed)) {
    setAssignMe(false)
    if (me) setFacts(previous => ({ ...previous, assigneeIds: [me.userId] }))
  }
  const assignedToMe = myId !== undefined && facts.assigneeIds.includes(myId)

  const pickBoard = (boardId: string) => {
    if (boardId === chosen?.id) return
    setPicked(boardId)
    setPickedSection(undefined)
    // Members, labels and sections belong to the board they were picked in;
    // whoever picks a board is one of its members.
    change({ assigneeIds: assignedToMe ? [myId] : [], labelIds: [] })
  }

  const sections = board?.sections ?? []
  const section =
    sections.find(each => each.id === pickedSection) ?? defaultSection(sections)

  // Closed while creating, it would miss the task once created.
  const close = () => {
    if (create.isPending) return
    if (title.trim() || description.trim()) setAsking(true)
    else onClose()
  }

  const showBoard = () => {
    flushSync(() => {
      setDetails(true)
    })
    boardSelect.current?.focus()
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
          const created = {
            ...task,
            title: title.trim(),
            board: chosen.name,
            elsewhere:
              (preset.dueDate !== undefined &&
                facts.dueDate !== preset.dueDate) ||
              (preset.assignToMe === true && !assignedToMe)
          }
          onCreated(created, another)
          if (!another) return
          // The title stays editable while creating: keep what was typed since.
          setTitle(current => (current === title ? '' : current))
          setDescription(current => (current === description ? '' : current))
          setCleared(cleared + 1)
          setStarted(undefined)
          setLast(created)
          create.reset()
          titleRef.current?.focus()
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
  const destination =
    chosen &&
    [
      section
        ? t('newTask.destination', {
            board: chosen.name,
            section: section.name
          })
        : t('newTask.destinationBoard', { board: chosen.name }),
      ...(facts.dueDate === inDays(0) ? [t('newTask.dueToday')] : []),
      ...(facts.dueDate === inDays(1) ? [t('newTask.dueTomorrow')] : []),
      ...(assignedToMe ? [t('newTask.assignedToYou')] : [])
    ].join(' · ')
  const lastSaid =
    last && t('newTask.createdIn', { title: last.title, board: last.board })

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
                  title: t('newTask.taskTitle'),
                  'aria-required': true
                }
              }}
            />
            {last && (
              <Stack
                direction="row"
                spacing={1}
                className="u-flex-items-center"
                role="status"
                aria-label={lastSaid ?? undefined}
              >
                <Typography variant="body2" color="textSecondary">
                  {lastSaid}
                </Typography>
                <Button
                  variant="text"
                  size="small"
                  onClick={() => {
                    void navigate(taskPath(last))
                  }}
                >
                  {t('newTask.seeTask')}
                </Button>
              </Stack>
            )}
            <Stack
              direction="row"
              spacing={1}
              className="u-flex-items-center u-flex-justify-between"
            >
              {destination ? (
                <Button
                  variant="text"
                  size="small"
                  startIcon={<Icon icon={Mosaic} size={14} />}
                  onClick={showBoard}
                >
                  {destination}
                </Button>
              ) : (
                <span />
              )}
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
            </Stack>
            {details && (
              <>
                <RichTextEditor
                  key={cleared}
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
                        inputRef={boardSelect}
                      />
                    )}
                  </Property>
                  {/* Always there, so that picking another board moves
                      nothing; a choice only when there is one to make. */}
                  <Property
                    id={sectionLabelId}
                    icon={<Icon icon={Folder} />}
                    label={t('newTask.section')}
                  >
                    {section && sections.length > 1 ? (
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
                    ) : (
                      board && (
                        <Typography
                          variant="body2"
                          {...(!section && { color: 'textSecondary' })}
                        >
                          {section?.name ?? t('board.noSection')}
                        </Typography>
                      )
                    )}
                  </Property>
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
          <FormControlLabel
            label={t('newTask.createAnother')}
            control={
              <Checkbox
                size="small"
                checked={another}
                onChange={event => {
                  setAnother(event.target.checked)
                }}
              />
            }
          />
          <Button
            type="submit"
            disabled={
              create.isPending ||
              !chosen ||
              // Until it is known whether I am a member of the board.
              assignMe ||
              description.length > MAX_DESCRIPTION
            }
          >
            {t(started ? 'newTask.save' : 'newTask.create')}
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
