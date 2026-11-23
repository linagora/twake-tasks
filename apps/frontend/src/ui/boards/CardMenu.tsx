import { Alert, Divider } from '@linagora/twake-mui'
import {
  Archive,
  CalendarToday,
  CheckSquare,
  Copy,
  FolderMoveto,
  Label as LabelIcon,
  Link as LinkIcon,
  Moveto,
  PersonAdd,
  Trash
} from '@linagora/twake-icons'
import { useState, type ReactElement } from 'react'

import type { KeySelect } from '@/ds/Columns'
import { IconMenuItem } from '@/ds/IconMenuItem'
import { Menu } from '@/ds/Menu'
import { Toast } from '@/ds/Toast'
import type { Label, Person, Section, Task } from '@/domain/board'
import { useRemoveTask } from '@/ui/boards/Archive'
import { AssignPicker } from '@/ui/boards/AssignPicker'
import { useCopyLink } from '@/ui/boards/CopyLink'
import { DatesEditor } from '@/ui/boards/Dates'
import { useDuplicate } from '@/ui/boards/DuplicateTask'
import { LabelsPicker } from '@/ui/boards/LabelsPicker'
import { TransferDialog, useTransferable } from '@/ui/boards/TransferTask'
import { useI18n } from '@/ui/i18n/useI18n'
import { useCachedBoard } from '@/ui/queries/boards'

// The whole board's tasks, read only by what opens from the card: a card that
// took them would render again on any change of the board.
export function BoardTasks({
  boardId,
  children
}: {
  boardId: string
  children: (tasks: Task[]) => ReactElement
}): ReactElement {
  return children(useCachedBoard(boardId)?.tasks ?? [])
}

export interface CardContext {
  task: Task
  boardId: string
  members: Person[]
  shareable: boolean
  labels: Label[]
  sections: Section[]
  onMove:
    ((taskId: string, sectionId: Section['id'] | null) => void) | undefined
  onOpen: (key: string) => void
}

/** The options menu of a card, with the pickers and toasts it opens. */
export function CardMenu({
  task,
  boardId,
  members,
  shareable,
  labels,
  sections,
  onMove,
  onOpen,
  select,
  menuAnchor,
  setMenuAnchor,
  assigning,
  setAssigning
}: CardContext & {
  select: KeySelect | undefined
  menuAnchor: HTMLElement | null
  setMenuAnchor: (anchor: HTMLElement | null) => void
  assigning: HTMLElement | null
  setAssigning: (anchor: HTMLElement | null) => void
}): ReactElement {
  const { t } = useI18n()
  const [labeling, setLabeling] = useState<HTMLElement | null>(null)
  const [dating, setDating] = useState<HTMLElement | null>(null)
  const [moving, setMoving] = useState(false)
  const stopMoving = () => {
    setMoving(false)
  }
  const transferable = useTransferable(task, boardId)
  const link = useCopyLink(boardId, task.key, false)
  const copy = useDuplicate(boardId, task, onOpen)
  const remove = useRemoveTask(boardId, task)
  const destinations = sections.filter(section => section.id !== task.sectionId)
  const choose = (action: () => void) => () => {
    setMenuAnchor(null)
    action()
  }

  return (
    <>
      <Menu
        anchorEl={menuAnchor}
        open={menuAnchor !== null}
        onClose={() => {
          setMenuAnchor(null)
        }}
      >
        <IconMenuItem
          icon={PersonAdd}
          onClick={choose(() => {
            setAssigning(menuAnchor)
          })}
        >
          {t('board.assign')}
        </IconMenuItem>
        <IconMenuItem
          icon={LabelIcon}
          onClick={choose(() => {
            setLabeling(menuAnchor)
          })}
        >
          {t('board.labels')}
        </IconMenuItem>
        <IconMenuItem
          icon={CalendarToday}
          onClick={choose(() => {
            setDating(menuAnchor)
          })}
        >
          {t('board.dueDate')}
        </IconMenuItem>
        {(destinations.length > 0 || transferable) && <Divider />}
        {destinations.map(destination => (
          <IconMenuItem
            icon={Moveto}
            key={destination.id}
            onClick={choose(() => {
              onMove?.(task.id, destination.id)
            })}
          >
            {t('board.moveTo', { section: destination.name })}
          </IconMenuItem>
        ))}
        {transferable && (
          <IconMenuItem
            icon={FolderMoveto}
            onClick={choose(() => {
              setMoving(true)
            })}
          >
            {t('transfer.title')}
          </IconMenuItem>
        )}
        <Divider />
        <IconMenuItem icon={Copy} onClick={choose(copy.duplicate)}>
          {t('task.duplicate')}
        </IconMenuItem>
        <IconMenuItem
          icon={LinkIcon}
          onClick={event => {
            setMenuAnchor(null)
            link.copy(event.currentTarget)
          }}
        >
          {t('task.copyLink')}
        </IconMenuItem>
        {select && !select.checked && (
          <IconMenuItem
            icon={CheckSquare}
            onClick={choose(() => {
              select.onToggle(false)
            })}
          >
            {t('bulk.selectTask')}
          </IconMenuItem>
        )}
        <Divider />
        <IconMenuItem
          icon={Archive}
          onClick={choose(() => {
            remove.mutate('archived')
          })}
        >
          {t('archive.archive')}
        </IconMenuItem>
        <IconMenuItem
          icon={Trash}
          onClick={choose(() => {
            remove.mutate('trash')
          })}
        >
          {t('archive.delete')}
        </IconMenuItem>
      </Menu>
      {link.notice}
      {copy.notice}
      <Toast
        open={remove.isError}
        autoHideDuration={4000}
        onClose={() => {
          remove.reset()
        }}
      >
        <Alert severity="error" role="alert">
          {t('archive.failed')}
        </Alert>
      </Toast>
      {dating && (
        <DatesEditor
          task={task}
          boardId={boardId}
          anchor={dating}
          onClose={() => {
            setDating(null)
          }}
        />
      )}
      {moving && (
        <TransferDialog
          task={task}
          boardId={boardId}
          onMoved={stopMoving}
          onClose={stopMoving}
        />
      )}
      {assigning && (
        <BoardTasks boardId={boardId}>
          {tasks => (
            <AssignPicker
              task={task}
              boardId={boardId}
              members={members}
              tasks={tasks}
              shareable={shareable}
              anchor={assigning}
              onClose={() => {
                setAssigning(null)
              }}
            />
          )}
        </BoardTasks>
      )}
      {labeling && (
        <LabelsPicker
          task={task}
          boardId={boardId}
          labels={labels}
          anchor={labeling}
          onClose={() => {
            setLabeling(null)
          }}
        />
      )}
    </>
  )
}
