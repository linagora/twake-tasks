import {
  Archive,
  Check,
  CheckList,
  Cross,
  Dots,
  FolderMoveto,
  Icon,
  Pen,
  Trash
} from '@linagora/twake-icons'
import {
  Button,
  Dialog,
  DialogActions,
  DialogTitle,
  IconButton,
  Menu,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme
} from '@linagora/twake-mui'
import { useId, useState, type ReactElement, type ReactNode } from 'react'

import { ApiError } from '@/application/boards'
import { IconMenuItem } from '@/ds/IconMenuItem'
import { RichText, RichTextEditor } from '@/ds/RichText'
import {
  Grow,
  HeaderToggle,
  Inline,
  PanelSection,
  SidePanel,
  useInPeek
} from '@/ds/SidePanel'
import { UnavailableButton } from '@/ds/PageHeader'
import { MAX_TASK_DEPTH, type Section, type Task } from '@/domain/board'
import { useRemoveTask } from '@/ui/boards/Archive'
import { Comments } from '@/ui/boards/Comments'
import { CopyLinkButton } from '@/ui/boards/CopyLink'
import { History } from '@/ui/boards/History'
import { FollowButton } from '@/ui/boards/Notifications'
import {
  useBoard,
  useBoards,
  useCreateTask,
  useDescription,
  useSetDescription
} from '@/ui/boards/queries'
import { Subtasks } from '@/ui/boards/Subtasks'
import { TaskBreadcrumb } from '@/ui/boards/TaskBreadcrumb'
import { TaskProperties, Title } from '@/ui/boards/TaskProperties'
import { TransferTask } from '@/ui/boards/TransferTask'
import { useCompleteToggle } from '@/ui/boards/useCompleteToggle'
import { useEmojiInput } from '@/ui/boards/useEmojiInput'
import { useRichTextLabels } from '@/ui/boards/useRichTextLabels'
import {
  UnsavedContext,
  useUnsaved,
  useUnsavedFields
} from '@/ui/boards/unsaved'
import { useExpandedPanel, useTaskPanel } from '@/ui/boards/useTaskPanel'
import { useDrivePicker } from '@/ui/drive/useDrivePicker'
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
  const archived = shelved || (board?.archived ?? false)
  const unsaved = useUnsavedFields()
  const [asking, setAsking] = useState(false)
  const [expanded, expand] = useExpandedPanel()
  const close = () => {
    if (unsaved.any()) setAsking(true)
    else onClose()
  }

  return (
    <UnsavedContext value={unsaved.mark}>
      <SidePanel
        label={`${task.key} ${task.title}`}
        onClose={close}
        unsaved={unsaved.any}
        expanded={expanded}
        onExpand={expand}
        expandLabel={t('task.expand')}
        peekLabel={t('task.peek')}
        header={
          <>
            <TaskBreadcrumb task={task} board={board} />
            <Grow />
            {board && (
              <CompleteButton
                task={task}
                boardId={boardId}
                sections={board.sections}
                editable={editable}
              />
            )}
            <FollowButton task={task} boardId={boardId} />
            <CopyLinkButton
              boardId={boardId}
              taskKey={task.key}
              expanded={expanded}
            />
            {editable && (
              <TaskMenu task={task} boardId={boardId} onRemoved={onClose} />
            )}
            <IconButton
              size="small"
              aria-label={t('task.close')}
              onClick={close}
            >
              <Icon icon={Cross} />
            </IconButton>
          </>
        }
        lead={
          <>
            {notice}
            <Title task={task} boardId={boardId} editable={editable} />
          </>
        }
        aside={
          <TaskProperties
            task={task}
            boardId={boardId}
            board={board}
            editable={editable}
            archived={archived}
          />
        }
      >
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
        <div>
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
            <div hidden={tab !== 'comments'}>
              <Comments
                task={task}
                boardId={boardId}
                members={board?.members ?? []}
                tasks={board?.tasks ?? []}
                archived={archived}
              />
            </div>
            {tab === 'history' && <History task={task} boardId={boardId} />}
          </div>
        </div>
        {asking && (
          <DiscardDialog
            onKeep={() => {
              setAsking(false)
            }}
            onDiscard={onClose}
          />
        )}
      </SidePanel>
    </UnsavedContext>
  )
}

function CompleteButton({
  task,
  boardId,
  sections,
  editable
}: {
  task: Task
  boardId: string
  sections: Section[]
  editable: boolean
}): ReactElement {
  const { t } = useI18n()
  const theme = useTheme()
  const inPeek = useInPeek()
  const iconOnly = useMediaQuery(theme.breakpoints.down('md')) || inPeek
  const { done, disabled, noDoneSection, toggle } = useCompleteToggle(
    task,
    boardId,
    sections,
    editable
  )
  const icon = <Icon icon={Check} />
  const unavailable = editable && task.canceledAt === null && noDoneSection

  if (iconOnly) {
    const label = done ? t('task.markIncomplete') : t('task.markComplete')
    // aria-disabled keeps the button hoverable, so its tooltip can say why.
    return (
      <Tooltip
        title={unavailable ? t('task.noDoneSection') : disabled ? '' : label}
        describeChild
      >
        <HeaderToggle
          size="small"
          on={done}
          unavailable={unavailable}
          aria-label={label}
          aria-disabled={unavailable ? 'true' : undefined}
          disabled={!unavailable && disabled}
          disableRipple={unavailable}
          onClick={unavailable ? undefined : toggle}
        >
          {icon}
        </HeaderToggle>
      </Tooltip>
    )
  }

  const label = done ? t('task.completed') : t('task.markComplete')
  const props = {
    size: 'small',
    variant: done ? 'contained' : 'outlined',
    color: done ? 'success' : 'primary',
    startIcon: icon,
    children: label
  } as const
  if (unavailable) {
    return (
      <Tooltip title={t('task.noDoneSection')} describeChild>
        <UnavailableButton {...props} aria-disabled="true" disableRipple />
      </Tooltip>
    )
  }
  return <Button {...props} disabled={disabled} onClick={toggle} />
}

function DiscardDialog({
  onKeep,
  onDiscard
}: {
  onKeep: () => void
  onDiscard: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  return (
    <Dialog open onClose={onKeep} aria-labelledby={titleId} size="small">
      <DialogTitle id={titleId}>{t('task.discardTitle')}</DialogTitle>
      <DialogActions>
        <Button variant="text" onClick={onKeep}>
          {t('task.keepEditing')}
        </Button>
        <Button onClick={onDiscard}>{t('task.discard')}</Button>
      </DialogActions>
    </Dialog>
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
          <IconMenuItem
            icon={FolderMoveto}
            onClick={choose(() => {
              setMoving(true)
            })}
          >
            {t('transfer.title')}
          </IconMenuItem>
        )}
        <IconMenuItem
          icon={Archive}
          onClick={choose(() => {
            remove.mutate('archived', { onSuccess: onRemoved })
          })}
        >
          {t('archive.archive')}
        </IconMenuItem>
        <IconMenuItem
          icon={Trash}
          onClick={choose(() => {
            remove.mutate('trash', { onSuccess: onRemoved })
          })}
        >
          {t('archive.delete')}
        </IconMenuItem>
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
  const drive = useDrivePicker()
  const emojiInput = useEmojiInput()
  const description = useDescription(boardId, task.id)
  const save = useSetDescription(boardId, task.id)
  const [draft, setDraft] = useState<string | null>(null)
  const [draftVersion, setDraftVersion] = useState(0)
  useUnsaved(draft !== null && draft !== description.data?.markdown)
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
          <Tooltip title={t('task.editDescription')}>
            <IconButton
              size="small"
              aria-label={t('task.editDescription')}
              onClick={() => {
                setDraft(description.data.markdown)
                setDraftVersion(description.data.version)
              }}
            >
              <Icon icon={Pen} size={14} />
            </IconButton>
          </Tooltip>
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
              {
                markdown: draft,
                version: stale ? description.data.version : draftVersion
              },
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
            linkPicker={drive.linkPicker}
            emoji={emojiInput.emoji}
            suggestions={[emojiInput.suggestions]}
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
                  disabled={
                    save.isPending ||
                    (stale && description.isFetching) ||
                    draft.length > MAX_DESCRIPTION
                  }
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
      {drive.dialog}
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
  useUnsaved(Boolean(title?.trim()))

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
