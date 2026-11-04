import {
  Archive,
  CalendarToday,
  Flag,
  FolderMoveto,
  Label as LabelIcon,
  Moveto,
  PersonAdd,
  Trash
} from '@linagora/twake-icons'
import { Menu } from '@linagora/twake-mui'
import { useState, type ReactElement, type ReactNode } from 'react'

import type { BulkAction } from '@/application/boards'
import { BULK_LIMIT, undoOf } from '@/application/bulkChange'
import { IconMenuItem } from '@/ds/IconMenuItem'
import { popoverOrigins } from '@/ds/Picker'
import { DayPopover } from '@/ds/Pickers'
import { BarAction, SelectionBar } from '@/ds/SelectionBar'
import {
  isEditable,
  isFolded,
  isShareable,
  type Board,
  type Priority
} from '@/domain/board'
import { BulkDeleteDialog, BulkTransferDialog } from '@/ui/boards/BulkDialogs'
import { BulkNotice, type Notice } from '@/ui/boards/BulkNotice'
import { inDays, untilNextMonday } from '@/ui/boards/dueLabel'
import { LabelsMenu } from '@/ui/boards/LabelsMenu'
import { PeopleMenu } from '@/ui/boards/PeopleMenu'
import {
  SelectionContext,
  useBoardSelection,
  type Selection
} from '@/ui/boards/Selection'
import { isTarget } from '@/ui/boards/TransferTask'
import { useBoards } from '@/ui/queries/boards'
import { useChangeTasks } from '@/ui/queries/tasks'
import { useI18n } from '@/ui/i18n/useI18n'

type Opened = 'move' | 'assign' | 'labels' | 'due' | 'priority'

const PRIORITIES: (Priority | null)[] = [1, 2, 3, 4, null]

function shared(lists: string[][]): Set<string> {
  const [first = [], ...rest] = lists
  return new Set(first.filter(id => rest.every(list => list.includes(id))))
}

/**
 * Lets editors pick tasks on the board or the list, and change them together
 * from a bar.
 */
export function BoardSelection({
  board,
  children
}: {
  board: Board
  children: ReactNode
}): ReactElement {
  const topLevel = board.tasks.filter(task => task.parentId === null)
  // Each section's tasks as they show: the open ones, then the completed fold.
  const selection = useBoardSelection(
    [null, ...board.sections.map(section => section.id)].map(sectionId => {
      const lane = topLevel.filter(task => task.sectionId === sectionId)
      return [
        ...lane.filter(task => !isFolded(task, board.sections)),
        ...lane.filter(task => isFolded(task, board.sections))
      ].map(task => task.id)
    })
  )
  const selectable = isEditable(board) && board.layout !== 'calendar'
  return (
    <SelectionContext.Provider value={selectable ? selection : null}>
      {children}
      {selectable && <BulkActions board={board} selection={selection} />}
    </SelectionContext.Provider>
  )
}

function BulkActions({
  board,
  selection
}: {
  board: Board
  selection: Selection
}): ReactElement {
  const { t } = useI18n()
  const change = useChangeTasks(board.id)
  const [opened, setOpened] = useState<{
    menu: Opened
    anchor: HTMLElement
  } | null>(null)
  const [dialog, setDialog] = useState<'transfer' | 'delete' | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const transferable =
    useBoards().data?.some(each => isTarget(each, board.id)) ?? false
  const { ids } = selection
  const picked = board.tasks.filter(task => ids.includes(task.id))
  const tooMany = ids.length > BULK_LIMIT
  const busy = change.isPending || tooMany

  const run = (action: BulkAction, target?: string) => {
    setOpened(null)
    setDialog(null)
    change.mutate([{ taskIds: ids, action }], {
      onSuccess: failed => {
        const changed = picked.filter(task => !failed.includes(task.id))
        selection.keep(failed)
        setNotice({
          action,
          total: picked.length,
          changed: changed.length,
          ...(target !== undefined && { board: target }),
          undo: changed.length > 0 ? undoOf(changed, action) : null
        })
      },
      onError: () => {
        setNotice({ action, total: picked.length, changed: 0, undo: null })
      }
    })
  }
  const open = (menu: Opened) => (event: { currentTarget: HTMLElement }) => {
    setOpened({ menu, anchor: event.currentTarget })
  }
  const close = () => {
    setOpened(null)
  }
  const anchorOf = (menu: Opened) =>
    opened?.menu === menu ? opened.anchor : null
  const assigned = shared(
    picked.map(task => task.assignees.map(person => person.userId))
  )
  const labeled = shared(picked.map(task => task.labels.map(label => label.id)))

  return (
    <>
      {ids.length > 0 && (
        <SelectionBar
          label={t('bulk.bar')}
          count={
            tooMany
              ? t('bulk.tooMany', { max: BULK_LIMIT })
              : t('bulk.selected', { smart_count: ids.length })
          }
          clearLabel={t('bulk.clear')}
          onClear={selection.clear}
        >
          {board.sections.length > 0 && (
            <BarAction
              icon={Moveto}
              label={t('bulk.moveTo')}
              disabled={busy}
              expanded={anchorOf('move') !== null}
              onClick={open('move')}
            />
          )}
          <BarAction
            icon={PersonAdd}
            label={t('board.assign')}
            disabled={busy}
            expanded={anchorOf('assign') !== null}
            onClick={open('assign')}
          />
          <BarAction
            icon={LabelIcon}
            label={t('board.labels')}
            disabled={busy}
            expanded={anchorOf('labels') !== null}
            onClick={open('labels')}
          />
          <BarAction
            icon={CalendarToday}
            label={t('board.dueDate')}
            disabled={busy}
            expanded={anchorOf('due') !== null}
            onClick={open('due')}
          />
          <BarAction
            icon={Flag}
            label={t('task.priority')}
            disabled={busy}
            expanded={anchorOf('priority') !== null}
            onClick={open('priority')}
          />
          {transferable && (
            <BarAction
              icon={FolderMoveto}
              label={t('transfer.title')}
              disabled={busy}
              onClick={() => {
                setDialog('transfer')
              }}
            />
          )}
          <BarAction
            icon={Archive}
            label={t('archive.archive')}
            disabled={busy}
            onClick={() => {
              run({ kind: 'archive' })
            }}
          />
          <BarAction
            icon={Trash}
            label={t('archive.delete')}
            danger
            disabled={busy}
            onClick={() => {
              setDialog('delete')
            }}
          />
        </SelectionBar>
      )}
      <Menu
        anchorEl={anchorOf('move')}
        open={anchorOf('move') !== null}
        onClose={close}
        {...popoverOrigins(anchorOf('move'))}
      >
        {board.sections.map(section => (
          <IconMenuItem
            key={section.id}
            icon={Moveto}
            onClick={() => {
              run({ kind: 'move', sectionId: section.id })
            }}
          >
            {section.name}
          </IconMenuItem>
        ))}
      </Menu>
      <Menu
        anchorEl={anchorOf('priority')}
        open={anchorOf('priority') !== null}
        onClose={close}
        {...popoverOrigins(anchorOf('priority'))}
      >
        {PRIORITIES.map(priority => (
          <IconMenuItem
            key={String(priority)}
            icon={priority === null ? undefined : Flag}
            onClick={() => {
              run({ kind: 'edit', changes: { priority } })
            }}
          >
            {priority === null
              ? t('task.noPriority')
              : t('board.priorityLabel', { level: priority })}
          </IconMenuItem>
        ))}
      </Menu>
      {opened?.menu === 'assign' && (
        <PeopleMenu
          label={t('bulk.assignTitle', { smart_count: ids.length })}
          boardId={board.id}
          members={board.members}
          tasks={board.tasks}
          shareable={isShareable(board)}
          pinned={assigned}
          chosen={assigned}
          onToggle={userId => {
            run({ kind: 'assign', userId, assigned: !assigned.has(userId) })
          }}
          anchor={opened.anchor}
          onClose={close}
        />
      )}
      {opened?.menu === 'labels' && (
        <LabelsMenu
          label={t('bulk.labelsTitle', { smart_count: ids.length })}
          boardId={board.id}
          labels={board.labels}
          chosen={labeled}
          onToggle={labelId => {
            run({ kind: 'label', labelId, labeled: !labeled.has(labelId) })
          }}
          onCreated={labelId => {
            run({ kind: 'label', labelId, labeled: true })
          }}
          anchor={opened.anchor}
          onClose={close}
        />
      )}
      <DayPopover
        label={t('board.dueDate')}
        anchor={anchorOf('due')}
        onClose={close}
        value={
          new Set(picked.map(task => task.dueDate)).size === 1
            ? (picked[0]?.dueDate ?? '')
            : null
        }
        onChange={day => {
          run({ kind: 'edit', changes: { dueDate: day || null } })
        }}
        picks={[
          { label: t('dates.today'), day: inDays(0) },
          { label: t('dates.tomorrow'), day: inDays(1) },
          { label: t('dates.nextWeek'), day: inDays(untilNextMonday()) },
          { label: t('dates.noDate'), day: '' }
        ]}
      />
      {dialog === 'transfer' && (
        <BulkTransferDialog
          boardId={board.id}
          taskIds={ids}
          onMove={to => {
            run(
              {
                kind: 'transfer',
                to: { boardId: to.boardId, sectionId: to.sectionId }
              },
              to.name
            )
          }}
          onClose={() => {
            setDialog(null)
          }}
        />
      )}
      {dialog === 'delete' && (
        <BulkDeleteDialog
          count={ids.length}
          onDelete={() => {
            run({ kind: 'trash' })
          }}
          onClose={() => {
            setDialog(null)
          }}
        />
      )}
      {notice && (
        <BulkNotice
          boardId={board.id}
          notice={notice}
          aboveBar={ids.length > 0}
          onChange={setNotice}
        />
      )}
    </>
  )
}
