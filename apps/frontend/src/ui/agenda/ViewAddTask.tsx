import { Icon, Plus } from '@linagora/twake-icons'
import {
  Button,
  ClickAwayListener,
  TextField,
  Typography
} from '@linagora/twake-mui'
import { useRef, useState, type ReactElement } from 'react'

import type { ViewTask } from '@/application/viewTask'
import { ColumnAddButton } from '@/ds/Columns'
import { Inline } from '@/ds/SidePanel'
import { useCreateViewTask } from '@/ui/boards/queries'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'
import { useSession } from '@/ui/session/SessionGate'

/**
 * The "Add task" at the foot of a column of a view, as on a board: the task
 * goes in the column's section, with what the view asks of it.
 */
export function ViewAddTask({
  task,
  sectionName,
  open,
  onOpen,
  onClose
}: {
  task: Omit<ViewTask, 'title'>
  sectionName: string
  open: boolean
  onOpen: () => void
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const { user } = useSession()
  const create = useCreateViewTask()
  const [title, setTitle] = useState('')
  const refocus = useRef(false)
  const close = () => {
    refocus.current = true
    setTitle('')
    create.reset()
    onClose()
  }

  if (!open) {
    return (
      <ColumnAddButton
        ref={(node: HTMLButtonElement | null) => {
          if (node && refocus.current) {
            refocus.current = false
            node.focus()
          }
        }}
        variant="text"
        fullWidth
        startIcon={<Icon icon={Plus} />}
        onClick={onOpen}
        aria-label={t('board.addTask', { section: sectionName })}
      >
        {t('board.newTask')}
      </ColumnAddButton>
    )
  }
  return (
    <ClickAwayListener onClickAway={onClose}>
      <form
        onSubmit={event => {
          event.preventDefault()
          create.mutate(
            { task: { ...task, title: title.trim() }, myEmail: user.email },
            {
              onSuccess: () => {
                setTitle('')
              }
            }
          )
        }}
      >
        <TextField
          label={t('board.taskTitle')}
          value={title}
          onChange={event => {
            setTitle(event.target.value)
          }}
          onKeyDown={event => {
            if (event.key === 'Escape') close()
          }}
          size="small"
          fullWidth
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
            className="u-mt-1"
            disabled={create.isPending || !title.trim()}
          >
            {t('board.add')}
          </Button>
          <Button
            variant="text"
            size="small"
            className="u-mt-1"
            onClick={close}
          >
            {t('board.cancel')}
          </Button>
        </Inline>
      </form>
    </ClickAwayListener>
  )
}
