import { Icon, Plus } from '@linagora/twake-icons'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography
} from '@linagora/twake-mui'
import { useId, useState, type ReactElement } from 'react'

import type { FilterCriteria } from '@/application/boards'
import {
  openSection,
  viewTaskDefaults,
  type ViewTask
} from '@/application/viewTask'
import { FieldGrid, FullWidth } from '@/ds/FormPanel'
import { localToday } from '@/ui/boards/dueLabel'
import { useBoard, useBoards, useCreateViewTask } from '@/ui/boards/queries'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'
import { useSession } from '@/ui/session/SessionGate'

// "No section" is an empty value, which MUI would otherwise draw the label over.
const SELECT_SLOTS = {
  select: { native: true },
  inputLabel: { shrink: true }
} as const

// The status of the view that the board lacks, made as a section.
const NEW_SECTION = 'new'

/**
 * A task made in a view: it takes the view's criteria without showing them,
 * so it shows in the view. Only its board, the inbox unless the view keeps
 * to a board, and its status, the view's, are fields.
 */
export function NewViewTask({
  criteria,
  dueOn,
  onClose
}: {
  criteria: FilterCriteria
  /** The day picked on the calendar, over the view's due date. */
  dueOn?: string | undefined
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const { user } = useSession()
  const boards = useBoards()
  const create = useCreateViewTask()
  const defaults = viewTaskDefaults(criteria, boards.data ?? [], localToday())
  const [title, setTitle] = useState('')
  const [boardId, setBoardId] = useState<string | null>(null)
  const [sectionId, setSectionId] = useState<string | null | undefined>(
    undefined
  )
  const { mine, priority, label } = defaults
  const dueDate = dueOn ?? defaults.dueDate
  const chosenBoard = boardId ?? defaults.boardId
  const board = useBoard(chosenBoard).data
  // A section the view keeps to, else the first open one.
  const kept = board?.sections.find(each =>
    criteria.statuses?.some(
      name =>
        name.trim().toLocaleLowerCase() === each.name.trim().toLocaleLowerCase()
    )
  )
  const missing = board && !kept ? criteria.statuses?.[0]?.trim() : undefined
  const section =
    sectionId === undefined
      ? missing
        ? NEW_SECTION
        : ((kept ?? openSection(board?.sections ?? []))?.id ?? null)
      : sectionId
  const writable = (boards.data ?? []).filter(
    each => each.role !== 'viewer' && !each.archived
  )

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="medium">
      <form
        onSubmit={event => {
          event.preventDefault()
          const task: ViewTask = {
            title: title.trim(),
            boardId: chosenBoard,
            sectionId: section === NEW_SECTION ? null : section,
            newSection: section === NEW_SECTION ? missing : undefined,
            mine,
            priority,
            label,
            dueDate
          }
          create.mutate({ task, myEmail: user.email }, { onSuccess: onClose })
        }}
      >
        <DialogTitle id={titleId}>{t('board.newTask')}</DialogTitle>
        <DialogContent>
          <FieldGrid>
            <FullWidth>
              <TextField
                label={t('viewTask.title')}
                value={title}
                fullWidth
                inputRef={focusOnMount}
                onChange={event => {
                  setTitle(event.target.value)
                }}
                slotProps={{ htmlInput: { maxLength: 500 } }}
              />
            </FullWidth>
            <TextField
              select
              label={t('viewTask.board')}
              value={chosenBoard}
              onChange={event => {
                setBoardId(event.target.value)
                setSectionId(undefined)
              }}
              slotProps={SELECT_SLOTS}
            >
              {writable.map(each => (
                <option key={each.id} value={each.id}>
                  {each.name}
                </option>
              ))}
            </TextField>
            <TextField
              select
              label={t('viewTask.status')}
              value={section ?? ''}
              onChange={event => {
                setSectionId(event.target.value || null)
              }}
              slotProps={SELECT_SLOTS}
            >
              <option value="">{t('board.noSection')}</option>
              {missing && <option value={NEW_SECTION}>{missing}</option>}
              {board?.sections.map(each => (
                <option key={each.id} value={each.id}>
                  {each.name}
                </option>
              ))}
            </TextField>
          </FieldGrid>
        </DialogContent>
        <DialogActions>
          {create.isError && (
            <Typography role="alert" variant="caption" color="error">
              {t('viewTask.failed')}
            </Typography>
          )}
          <Button variant="text" onClick={onClose}>
            {t('board.cancel')}
          </Button>
          <Button
            type="submit"
            startIcon={<Icon icon={Plus} />}
            disabled={create.isPending || !title.trim() || !chosenBoard}
          >
            {t('viewTask.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
