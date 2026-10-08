import {
  Archive,
  Compass,
  Icon,
  Left,
  Restore,
  Trash
} from '@linagora/twake-icons'
import {
  Alert,
  Button,
  Link,
  ToggleButton,
  Typography
} from '@linagora/twake-mui'
import {
  createContext,
  useContext,
  useId,
  useState,
  type ReactElement
} from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router'

import { ApiError, type HiddenTask, type Shelf } from '@/application/boards'
import { LabelChip } from '@/ds/Columns'
import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import { HeaderToggleGroup, PageHeader, ToggleLabel } from '@/ds/PageHeader'
import { ShelfHeader, ShelfList, ShelfRow, ShelfWhen } from '@/ds/ShelfList'
import { Toast } from '@/ds/Toast'
import type { Board, Task } from '@/domain/board'
import { useBoard, useBoardChange, useHiddenTasks } from '@/ui/boards/queries'
import { Assignees, PriorityChip } from '@/ui/boards/TaskFacts'
import { TaskPanel } from '@/ui/boards/TaskPanel'
import { useTaskPanel } from '@/ui/boards/useTaskPanel'
import { useI18n } from '@/ui/i18n/useI18n'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

export interface Removal {
  task: Task
  shelf: Shelf
}

// The panel that removes a task closes with it, so the board shows the notice.
export const RemovalNotices = createContext<(removal: Removal) => void>(
  () => undefined
)

export function useRemoveTask(boardId: string, task: Task) {
  const announce = useContext(RemovalNotices)
  return useBoardChange(boardId, async (api, shelf: Shelf) => {
    await (shelf === 'archived'
      ? api.archiveTask(boardId, task.id)
      : api.trashTask(boardId, task.id))
    announce({ task, shelf })
  })
}

export function RemovalNotice({
  board,
  removal,
  onOpenShelf,
  onClose
}: {
  board: Board
  removal: Removal
  onOpenShelf: (shelf: Shelf) => void
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const labelId = useId()
  const restore = useBoardChange(board.id, (api, taskId: string) =>
    api.restoreTask(board.id, taskId)
  )
  const { task, shelf } = removal

  return (
    <Toast
      open
      autoHideDuration={restore.isError ? null : 8000}
      onClose={(_, reason) => {
        if (reason !== 'clickaway') onClose()
      }}
    >
      <Alert
        severity={restore.isError ? 'error' : 'info'}
        role={restore.isError ? 'alert' : 'status'}
        aria-labelledby={labelId}
        action={
          <>
            <Button
              variant="text"
              size="small"
              disabled={restore.isPending}
              onClick={() => {
                restore.mutate(task.id, { onSuccess: onClose })
              }}
            >
              {t('archive.undo')}
            </Button>
            <Button
              variant="text"
              size="small"
              onClick={() => {
                onClose()
                onOpenShelf(shelf)
              }}
            >
              {t(
                shelf === 'archived'
                  ? 'archive.viewArchived'
                  : 'archive.viewTrash'
              )}
            </Button>
          </>
        }
      >
        <span id={labelId}>
          {restore.isError
            ? t('archive.failed')
            : t(shelf === 'archived' ? 'archive.archived' : 'archive.trashed', {
                key: task.key
              })}
        </span>
      </Alert>
    </Toast>
  )
}

const DAY = 24 * 3600 * 1000
const RETENTION_DAYS = 30

const UNITS = [
  ['year', 365 * DAY],
  ['month', 30 * DAY],
  ['day', DAY],
  ['hour', 3600 * 1000],
  ['minute', 60 * 1000]
] as const

function ago(at: string, lang: string): string {
  const elapsed = Date.parse(at) - Date.now()
  const format = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
  for (const [unit, size] of UNITS) {
    if (Math.abs(elapsed) >= size) {
      return format.format(Math.round(elapsed / size), unit)
    }
  }
  return format.format(0, 'minute')
}

const daysLeft = (at: string) =>
  Math.max(
    1,
    Math.ceil((Date.parse(at) + RETENTION_DAYS * DAY - Date.now()) / DAY)
  )

const SHELF_ICONS = { archived: Archive, trash: Trash } as const

export function ShelfScreen({ shelf }: { shelf: Shelf }): ReactElement {
  const { t } = useI18n()
  const { boardId = '' } = useParams()
  const board = useBoard(boardId)
  const title = t(
    shelf === 'archived' ? 'archive.archivedTasks' : 'archive.trash'
  )
  useDocumentTitle(board.data ? `${title} - ${board.data.name}` : null)
  const missing = board.error instanceof ApiError && board.error.status === 404

  return (
    <main className="u-p-2">
      {missing && (
        <EmptyState
          icon={Compass}
          title={t('board.notFound')}
          text={t('problems.notFoundHint')}
        />
      )}
      {board.isError && !missing && (
        <Typography role="alert">{t('board.loadFailed')}</Typography>
      )}
      {board.isPending && <ListSkeleton label={t('app.loading')} />}
      {board.data && (
        <ShelfTasks board={board.data} shelf={shelf} title={title} />
      )}
    </main>
  )
}

function ShelfTasks({
  board,
  shelf,
  title
}: {
  board: Board
  shelf: Shelf
  title: string
}): ReactElement {
  const { t } = useI18n()
  const navigate = useNavigate()
  const hidden = useHiddenTasks(board.id, shelf)
  const [restored, setRestored] = useState<{
    task: Task
    failed: boolean
  } | null>(null)
  const editable = board.role !== 'viewer' && !board.archived
  const tasks = hidden.data ?? []

  return (
    <>
      <PageHeader
        back={
          <Link
            component={RouterLink}
            to=".."
            relative="path"
            variant="body2"
            color="textSecondary"
            underline="hover"
            className="u-flex u-flex-items-center"
          >
            <Icon icon={Left} size={12} className="u-mr-half" />
            {t('archive.back', { board: board.name })}
          </Link>
        }
        title={
          <Typography variant="h3" component="h1" noWrap>
            {title}
          </Typography>
        }
        actions={
          <HeaderToggleGroup
            exclusive
            size="small"
            value={shelf}
            aria-label={t('archive.shelves')}
            onChange={(_event, next: Shelf | null) => {
              if (next && next !== shelf) {
                void navigate(`../${next}`, { relative: 'path', replace: true })
              }
            }}
          >
            {(['archived', 'trash'] as const).map(each => (
              <ToggleButton
                key={each}
                value={each}
                aria-label={t(`archive.${each}Shelf`)}
              >
                <Icon icon={SHELF_ICONS[each]} />
                <ToggleLabel>{t(`archive.${each}Shelf`)}</ToggleLabel>
              </ToggleButton>
            ))}
          </HeaderToggleGroup>
        }
      />
      {shelf === 'trash' && tasks.length > 0 && (
        <Alert severity="info" className="u-mb-1">
          {t('archive.retention')}
        </Alert>
      )}
      {hidden.isError && (
        <Alert severity="error" className="u-mb-1">
          {t('archive.loadFailed')}
        </Alert>
      )}
      {hidden.isPending && <ListSkeleton label={t('app.loading')} />}
      {hidden.isSuccess && tasks.length === 0 && (
        <EmptyState
          icon={SHELF_ICONS[shelf]}
          title={t(
            shelf === 'archived'
              ? 'archive.emptyArchived'
              : 'archive.emptyTrash'
          )}
          text={t(
            shelf === 'archived'
              ? 'archive.emptyArchivedHint'
              : 'archive.retention'
          )}
        />
      )}
      {tasks.length > 0 && (
        <>
          <ShelfHeader
            columns={[
              t('layout.task'),
              t('task.assignees'),
              t('task.priority'),
              t('task.labels'),
              t(
                shelf === 'archived'
                  ? 'archive.archivedOn'
                  : 'archive.deletedOn'
              )
            ]}
          />
          <ShelfList label={title}>
            {tasks.map(task => (
              <ShelfTask
                key={task.id}
                task={task}
                board={board}
                shelf={shelf}
                editable={editable}
                onRestored={failed => {
                  setRestored({ task, failed })
                }}
              />
            ))}
          </ShelfList>
        </>
      )}
      {restored && (
        <Toast
          key={restored.task.id}
          open
          autoHideDuration={restored.failed ? null : 6000}
          onClose={(_, reason) => {
            if (reason !== 'clickaway') setRestored(null)
          }}
        >
          {restored.failed ? (
            <Alert
              severity="error"
              onClose={() => {
                setRestored(null)
              }}
            >
              {t('archive.failed')}
            </Alert>
          ) : (
            <Alert
              severity="success"
              role="status"
              aria-label={t('archive.restored', { key: restored.task.key })}
              action={
                <Button
                  variant="text"
                  size="small"
                  onClick={() => {
                    void navigate(`..?task=${restored.task.key}`, {
                      relative: 'path'
                    })
                  }}
                >
                  {t('archive.openTask')}
                </Button>
              }
            >
              {t('archive.restored', { key: restored.task.key })}
            </Alert>
          )}
        </Toast>
      )}
    </>
  )
}

function ShelfTask({
  task,
  board,
  shelf,
  editable,
  onRestored
}: {
  task: HiddenTask
  board: Board
  shelf: Shelf
  editable: boolean
  onRestored: (failed: boolean) => void
}): ReactElement {
  const { t, lang } = useI18n()
  const panel = useTaskPanel(task.key)
  const restore = useBoardChange(board.id, api =>
    api.restoreTask(board.id, task.id)
  )
  const left = daysLeft(task.at)
  const restoreButton = (variant: 'secondary' | 'text') =>
    editable && (
      <Button
        variant={variant}
        size="small"
        startIcon={<Icon icon={Restore} />}
        disabled={restore.isPending}
        aria-label={t('archive.restoreTask', { key: task.key })}
        onClick={() => {
          restore.mutate(undefined, {
            onSuccess: () => {
              panel.close()
              onRestored(false)
            },
            onError: () => {
              onRestored(true)
            }
          })
        }}
      >
        {t('archive.restore')}
      </Button>
    )

  return (
    <>
      <ShelfRow
        label={`${task.key} ${task.title}`}
        taskKey={task.key}
        title={
          <Link
            component="button"
            variant="body2"
            color="inherit"
            underline="none"
            className="u-ta-left"
            onClick={() => {
              panel.show()
            }}
          >
            {task.title}
          </Link>
        }
        people={
          task.assignees.length > 0 && <Assignees people={task.assignees} />
        }
        priority={
          task.priority !== null && <PriorityChip priority={task.priority} />
        }
        labels={task.labels.map(label => (
          <LabelChip key={label.id} name={label.name} />
        ))}
        when={
          <ShelfWhen
            date={new Intl.DateTimeFormat(lang, {
              dateStyle: 'medium',
              timeStyle: 'short'
            }).format(new Date(task.at))}
            ago={ago(task.at, lang)}
            note={
              shelf === 'trash'
                ? t('archive.daysLeft', { smart_count: left })
                : undefined
            }
            tone={left <= 3 ? 'error' : left <= 7 ? 'warning' : 'textSecondary'}
          />
        }
        action={restoreButton('secondary')}
      />
      {panel.open && (
        <TaskPanel
          task={task}
          boardId={board.id}
          editable={false}
          depth={1}
          notice={
            <Alert
              severity={shelf === 'trash' ? 'warning' : 'info'}
              icon={<Icon icon={SHELF_ICONS[shelf]} />}
              action={restoreButton('text')}
            >
              {shelf === 'trash'
                ? t('archive.inTrash', { smart_count: left })
                : t('archive.isArchived')}
            </Alert>
          }
          onClose={() => {
            panel.close()
          }}
        />
      )}
    </>
  )
}
