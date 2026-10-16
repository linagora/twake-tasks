import { CheckList, Cross, Dots, Icon, Pen } from '@linagora/twake-icons'
import {
  Button,
  Dialog,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Tab,
  Tabs,
  TextField,
  Typography
} from '@linagora/twake-mui'
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'

import { ApiError } from '@/application/boards'
import { RichText, RichTextEditor } from '@/ds/RichText'
import { Grow, Inline, PanelSection, SidePanel } from '@/ds/SidePanel'
import { MAX_TASK_DEPTH, type Task } from '@/domain/board'
import { useRemoveTask } from '@/ui/boards/Archive'
import { Comments } from '@/ui/boards/Comments'
import { CopyLinkButton } from '@/ui/boards/CopyLink'
import { History } from '@/ui/boards/History'
import { FollowButton } from '@/ui/boards/Notifications'
import {
  useBoard,
  useBoardChange,
  useBoards,
  useCreateTask,
  useMoveTask,
  useDescription,
  useSetDescription
} from '@/ui/boards/queries'
import { Subtasks } from '@/ui/boards/Subtasks'
import { TaskBreadcrumb } from '@/ui/boards/TaskBreadcrumb'
import { TaskProperties, Title } from '@/ui/boards/TaskProperties'
import { TransferTask } from '@/ui/boards/TransferTask'
import { useRichTextLabels } from '@/ui/boards/useRichTextLabels'
import {
  onTop,
  openTask,
  TASK_KEYS,
  keyOf,
  TaskShortcutsContext,
  typing,
  useTaskShortcut,
  type TaskAction,
  type TaskShortcuts
} from '@/ui/boards/taskShortcuts'
import { useTaskPanel } from '@/ui/boards/useTaskPanel'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'

const MAX_DESCRIPTION = 50_000

export function TaskPanel({
  task,
  boardId,
  editable,
  depth,
  notice,
  shelved = false,
  onClose
}: {
  task: Task
  boardId: string
  editable: boolean
  depth: number
  notice?: ReactNode
  shelved?: boolean
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const board = useBoard(boardId).data
  const [tab, setTab] = useState<'comments' | 'history'>('comments')
  const tabsId = useId()
  const children = board?.tasks.filter(each => each.parentId === task.id) ?? []
  const done = children.filter(each => each.completedAt !== null).length
  const [shortcuts] = useState<TaskShortcuts>(() => new Map())
  const [id] = useState(() => Symbol(task.key))
  const comments = useRef<HTMLDivElement>(null)
  const complete = useBoardChange(boardId, (api, completed: boolean) =>
    api.completeTask(boardId, task.id, completed ? 'completed' : null)
  )
  const move = useMoveTask(boardId)
  useEffect(() => openTask(id), [id])

  // The keys of the task on top: a, l, e, c, x, m, offered by its parts.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.defaultPrevented || typing(event.target) || !onTop(id)) return
    const action = TASK_KEYS[event.key as keyof typeof TASK_KEYS] as
      TaskAction | undefined
    if (action === 'comment') {
      event.preventDefault()
      setTab('comments')
      setTimeout(() => {
        comments.current
          ?.querySelector<HTMLElement>('[contenteditable="true"]')
          ?.focus()
      }, 0)
    } else if (action === 'complete' && editable) {
      event.preventDefault()
      const sections = board?.sections ?? []
      const section = sections.find(each => each.id === task.sectionId)
      if (!section) {
        complete.mutate(task.completedAt === null)
        return
      }
      const target = sections.find(each =>
        section.category === 'completed'
          ? each.category === 'unstarted'
          : each.category === 'completed'
      )
      if (target) {
        move.mutate({ taskId: task.id, move: { sectionId: target.id } })
      }
    } else if (action) {
      const run = shortcuts.get(action)
      if (!run) return
      event.preventDefault()
      run()
    }
  })
  useEffect(() => {
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <TaskShortcutsContext value={shortcuts}>
      <SidePanel
        label={`${task.key} ${task.title}`}
        onClose={onClose}
        header={
          <>
            <TaskBreadcrumb task={task} board={board} />
            <Grow />
            <FollowButton task={task} boardId={boardId} />
            <CopyLinkButton boardId={boardId} taskKey={task.key} />
            {editable && (
              <TaskMenu task={task} boardId={boardId} onRemoved={onClose} />
            )}
            <IconButton
              size="small"
              aria-label={t('task.close')}
              onClick={onClose}
            >
              <Icon icon={Cross} />
            </IconButton>
          </>
        }
        aside={
          <TaskProperties
            task={task}
            boardId={boardId}
            board={board}
            editable={editable}
          />
        }
      >
        {notice}
        <Title task={task} boardId={boardId} editable={editable} />
        <Description task={task} boardId={boardId} editable={editable} />
        {(children.length > 0 || (editable && depth < MAX_TASK_DEPTH)) && (
          <PanelSection
            title={t('task.subtasks')}
            action={
              children.length > 0 && (
                <Inline>
                  <Icon icon={CheckList} size={14} />
                  <Typography variant="body2" color="textSecondary">
                    {`${String(done)}/${String(children.length)}`}
                  </Typography>
                </Inline>
              )
            }
          >
            {board && (
              <Subtasks
                parentId={task.id}
                tasks={board.tasks}
                boardId={boardId}
                editable={editable}
                label={t('task.subtasks')}
              />
            )}
            {editable && depth < MAX_TASK_DEPTH && (
              <AddSubtask task={task} boardId={boardId} />
            )}
          </PanelSection>
        )}
        {board &&
          children.map(child => (
            <LinkedTaskPanel
              key={child.id}
              task={child}
              tasks={board.tasks}
              boardId={boardId}
              editable={editable}
              depth={depth + 1}
            />
          ))}
        <div ref={comments}>
          <Tabs
            value={tab}
            onChange={(_event, value: 'comments' | 'history') => {
              setTab(value)
            }}
          >
            <Tab
              value="comments"
              label={t('task.comments')}
              id={`${tabsId}-comments`}
              aria-controls={`${tabsId}-panel`}
            />
            <Tab
              value="history"
              label={t('history.heading')}
              id={`${tabsId}-history`}
              aria-controls={`${tabsId}-panel`}
            />
          </Tabs>
          <div
            role="tabpanel"
            id={`${tabsId}-panel`}
            aria-labelledby={`${tabsId}-${tab}`}
            className="u-pt-1"
          >
            {tab === 'comments' ? (
              <Comments
                task={task}
                boardId={boardId}
                members={board?.members ?? []}
                tasks={board?.tasks ?? []}
                archived={shelved || (board?.archived ?? false)}
              />
            ) : (
              <History task={task} boardId={boardId} />
            )}
          </div>
        </div>
      </SidePanel>
    </TaskShortcutsContext>
  )
}

export function LinkedTaskPanel({
  task,
  tasks,
  boardId,
  editable,
  depth
}: {
  task: Task
  tasks: Task[]
  boardId: string
  editable: boolean
  depth: number
}): ReactElement | null {
  const panel = useTaskPanel(task.key, tasks)
  if (!panel.open) return null
  return (
    <TaskPanel
      task={task}
      boardId={boardId}
      editable={editable}
      depth={depth}
      onClose={panel.close}
    />
  )
}

function TaskMenu({
  task,
  boardId,
  onRemoved
}: {
  task: Task
  boardId: string
  onRemoved: () => void
}): ReactElement {
  const { t } = useI18n()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [moving, setMoving] = useState(false)
  useTaskShortcut('move', () => {
    if (movable) setMoving(true)
  })
  const titleId = useId()
  const remove = useRemoveTask(boardId, task)
  const boards = useBoards()
  const movable =
    task.parentId === null &&
    (boards.data?.some(
      board =>
        board.id !== boardId && board.role !== 'viewer' && !board.archived
    ) ??
      false)
  const choose = (action: () => void) => () => {
    setAnchor(null)
    action()
  }

  return (
    <>
      <IconButton
        size="small"
        aria-label={t('task.options')}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={event => {
          setAnchor(event.currentTarget)
        }}
      >
        <Icon icon={Dots} />
      </IconButton>
      {remove.isError && (
        <Typography role="alert" variant="caption" color="error">
          {t('archive.failed')}
        </Typography>
      )}
      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => {
          setAnchor(null)
        }}
      >
        {movable && (
          <MenuItem
            onClick={choose(() => {
              setMoving(true)
            })}
          >
            {t('transfer.title')}
          </MenuItem>
        )}
        <MenuItem
          onClick={choose(() => {
            remove.mutate('archived', { onSuccess: onRemoved })
          })}
        >
          {t('archive.archive')}
        </MenuItem>
        <MenuItem
          onClick={choose(() => {
            remove.mutate('trash', { onSuccess: onRemoved })
          })}
        >
          {t('archive.delete')}
        </MenuItem>
      </Menu>
      {moving && (
        <Dialog
          open
          onClose={() => {
            setMoving(false)
          }}
          aria-labelledby={titleId}
          size="small"
        >
          <DialogTitle id={titleId}>{t('transfer.title')}</DialogTitle>
          <TransferTask
            task={task}
            boardId={boardId}
            onMoved={onRemoved}
            onCancel={() => {
              setMoving(false)
            }}
          />
        </Dialog>
      )}
    </>
  )
}

function Description({
  task,
  boardId,
  editable
}: {
  task: Task
  boardId: string
  editable: boolean
}): ReactElement {
  const { t } = useI18n()
  const labels = useRichTextLabels()
  const description = useDescription(boardId, task.id)
  const save = useSetDescription(boardId, task.id)
  const [draft, setDraft] = useState<string | null>(null)
  useTaskShortcut('describe', () => {
    if (editable && description.data && draft === null) {
      setDraft(description.data.markdown)
    }
  })
  const stale =
    save.error instanceof ApiError && save.error.code === 'stale_version'

  return (
    <PanelSection
      title={t('task.description')}
      hideTitle={Boolean(description.data?.markdown.trim())}
      action={
        editable &&
        description.data &&
        draft === null && (
          <Button
            variant="text"
            size="small"
            startIcon={<Icon icon={Pen} size={14} />}
            aria-label={t('task.editDescription')}
            aria-keyshortcuts={keyOf('describe')}
            title={t('shortcuts.withKey', {
              label: t('task.editDescription'),
              key: keyOf('describe')
            })}
            onClick={() => {
              setDraft(description.data.markdown)
            }}
          >
            {t('task.edit')}
          </Button>
        )
      }
    >
      {description.isError && (
        <Typography role="alert">{t('task.loadFailed')}</Typography>
      )}
      {description.data &&
        draft === null &&
        (description.data.markdown.trim() ? (
          <RichText markdown={description.data.markdown} />
        ) : (
          <Typography variant="body2" color="textSecondary">
            {t('task.noDescription')}
          </Typography>
        ))}
      {description.data && draft !== null && (
        <form
          onSubmit={event => {
            event.preventDefault()
            save.mutate(
              { markdown: draft, version: description.data.version },
              {
                onSuccess: () => {
                  setDraft(null)
                }
              }
            )
          }}
        >
          <RichTextEditor
            label={t('task.description')}
            initial={description.data.markdown}
            placeholder={t('editor.descriptionPlaceholder')}
            labels={labels}
            minHeight={144}
            onChange={setDraft}
            footer={
              <>
                <Button
                  variant="text"
                  size="small"
                  onClick={() => {
                    save.reset()
                    setDraft(null)
                  }}
                >
                  {t('board.cancel')}
                </Button>
                <Button
                  type="submit"
                  size="small"
                  disabled={save.isPending || draft.length > MAX_DESCRIPTION}
                >
                  {t('board.save')}
                </Button>
              </>
            }
          />
          {save.isError && (
            <Typography
              role="alert"
              variant="body2"
              color="error"
              className="u-mt-half"
            >
              {stale ? t('task.stale') : t('task.saveFailed')}
            </Typography>
          )}
        </form>
      )}
    </PanelSection>
  )
}

function AddSubtask({
  task,
  boardId
}: {
  task: Task
  boardId: string
}): ReactElement {
  const { t } = useI18n()
  const create = useCreateTask(boardId)
  const [title, setTitle] = useState<string | null>(null)

  if (title === null) {
    return (
      <Button
        variant="text"
        size="small"
        startIcon={<Icon icon={CheckList} size={14} />}
        onClick={() => {
          setTitle('')
        }}
      >
        {t('task.addSubtask')}
      </Button>
    )
  }
  return (
    <form
      onSubmit={event => {
        event.preventDefault()
        create.mutate(
          { parentId: task.id, title: title.trim() },
          {
            onSuccess: () => {
              setTitle('')
            }
          }
        )
      }}
    >
      <TextField
        label={t('task.subtaskTitle')}
        value={title}
        onChange={event => {
          setTitle(event.target.value)
        }}
        size="small"
        fullWidth
        margin="dense"
        inputRef={focusOnMount}
        slotProps={{ htmlInput: { maxLength: 500 } }}
      />
      {create.isError && (
        <Typography role="alert" variant="caption">
          {t('board.addFailed')}
        </Typography>
      )}
      <Inline>
        <Button
          type="submit"
          size="small"
          disabled={create.isPending || !title.trim()}
        >
          {t('board.add')}
        </Button>
        <Button
          variant="text"
          size="small"
          onClick={() => {
            setTitle(null)
          }}
        >
          {t('board.cancel')}
        </Button>
      </Inline>
    </form>
  )
}
