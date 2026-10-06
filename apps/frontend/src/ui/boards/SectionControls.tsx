import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  TextField,
  Typography
} from '@linagora/twake-mui'
import { Dots, Icon, Plus } from '@linagora/twake-icons'
import { useId, useState, type ReactElement } from 'react'

import { NewColumnButton } from '@/ds/Columns'
import type { Board, Section, SectionCategory } from '@/domain/board'
import { useBoardChange } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

const CATEGORIES: SectionCategory[] = [
  'backlog',
  'unstarted',
  'started',
  'completed',
  'canceled'
]

export function NewSectionButton({ board }: { board: Board }): ReactElement {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const create = useBoardChange(board.id, (api, section: Omit<Section, 'id'>) =>
    api.createSection(board.id, section)
  )

  return (
    <>
      <NewColumnButton
        variant="text"
        startIcon={<Icon icon={Plus} />}
        onClick={() => {
          setOpen(true)
        }}
      >
        {t('section.new')}
      </NewColumnButton>
      {open && (
        <SectionDialog
          title={t('section.new')}
          initial={{ name: '', category: 'unstarted' }}
          change={create}
          onClose={() => {
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

export function SectionMenu({
  board,
  section
}: {
  board: Board
  section: Section
}): ReactElement {
  const { t } = useI18n()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null)
  const edit = useBoardChange(board.id, (api, changes: Omit<Section, 'id'>) =>
    api.editSection(board.id, section.id, changes)
  )
  const move = useBoardChange(
    board.id,
    (api, to: { afterId: string } | { beforeId: string }) =>
      api.moveSection(board.id, section.id, to)
  )
  const index = board.sections.indexOf(section)
  const previous = board.sections[index - 1]
  const next = board.sections[index + 1]
  const choose = (action: () => void) => () => {
    setAnchor(null)
    action()
  }

  return (
    <>
      <IconButton
        size="small"
        className="u-ml-auto"
        aria-label={t('section.options', { section: section.name })}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={event => {
          setAnchor(event.currentTarget)
        }}
      >
        <Icon icon={Dots} />
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => {
          setAnchor(null)
        }}
      >
        <MenuItem
          onClick={choose(() => {
            setDialog('edit')
          })}
        >
          {t('section.edit')}
        </MenuItem>
        {previous && (
          <MenuItem
            onClick={choose(() => {
              move.mutate({ beforeId: previous.id })
            })}
          >
            {t('section.moveLeft')}
          </MenuItem>
        )}
        {next && (
          <MenuItem
            onClick={choose(() => {
              move.mutate({ afterId: next.id })
            })}
          >
            {t('section.moveRight')}
          </MenuItem>
        )}
        <MenuItem
          onClick={choose(() => {
            setDialog('delete')
          })}
        >
          {t('section.delete')}
        </MenuItem>
      </Menu>
      {move.isError && (
        <Typography role="alert" variant="caption">
          {t('section.moveFailed')}
        </Typography>
      )}
      {dialog === 'edit' && (
        <SectionDialog
          title={t('section.editTitle')}
          initial={section}
          change={edit}
          onClose={() => {
            setDialog(null)
          }}
        />
      )}
      {dialog === 'delete' && (
        <DeleteSectionDialog
          board={board}
          section={section}
          onClose={() => {
            setDialog(null)
          }}
        />
      )}
    </>
  )
}

function SectionDialog({
  title,
  initial,
  change,
  onClose
}: {
  title: string
  initial: Omit<Section, 'id'>
  change: ReturnType<typeof useBoardChange<Omit<Section, 'id'>>>
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const [name, setName] = useState(initial.name)
  const [category, setCategory] = useState(initial.category)
  const close = () => {
    change.reset()
    onClose()
  }

  return (
    <Dialog open onClose={close} aria-labelledby={titleId} size="small">
      <form
        onSubmit={event => {
          event.preventDefault()
          change.mutate({ name: name.trim(), category }, { onSuccess: onClose })
        }}
      >
        <DialogTitle id={titleId}>{title}</DialogTitle>
        <DialogContent>
          <TextField
            label={t('section.name')}
            value={name}
            onChange={event => {
              setName(event.target.value)
            }}
            required
            fullWidth
            margin="dense"
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            select
            label={t('section.status')}
            value={category}
            onChange={event => {
              setCategory(event.target.value as SectionCategory)
            }}
            fullWidth
            margin="dense"
            slotProps={{ select: { native: true } }}
          >
            {CATEGORIES.map(value => (
              <option key={value} value={value}>
                {t(`section.category.${value}`)}
              </option>
            ))}
          </TextField>
          {change.isError && <p role="alert">{t('section.saveFailed')}</p>}
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={close}>
            {t('section.cancel')}
          </Button>
          <Button type="submit" disabled={change.isPending || !name.trim()}>
            {t('section.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

function DeleteSectionDialog({
  board,
  section,
  onClose
}: {
  board: Board
  section: Section
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const hasTasks = board.tasks.some(task => task.sectionId === section.id)
  const others = board.sections.filter(other => other.id !== section.id)
  const [tasksTo, setTasksTo] = useState(others[0]?.id ?? '')
  const remove = useBoardChange(
    board.id,
    (api, to: string | null | undefined) =>
      api.deleteSection(board.id, section.id, to)
  )

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="small">
      <form
        onSubmit={event => {
          event.preventDefault()
          remove.mutate(hasTasks ? tasksTo || null : undefined, {
            onSuccess: onClose
          })
        }}
      >
        <DialogTitle id={titleId}>
          {t('section.deleteTitle', { section: section.name })}
        </DialogTitle>
        <DialogContent>
          {hasTasks && (
            <TextField
              select
              label={t('section.tasksTo')}
              value={tasksTo}
              onChange={event => {
                setTasksTo(event.target.value)
              }}
              fullWidth
              margin="dense"
              slotProps={{ select: { native: true } }}
            >
              {others.map(other => (
                <option key={other.id} value={other.id}>
                  {other.name}
                </option>
              ))}
              <option value="">{t('board.noSection')}</option>
            </TextField>
          )}
          {remove.isError && <p role="alert">{t('section.deleteFailed')}</p>}
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={onClose}>
            {t('section.cancel')}
          </Button>
          <Button type="submit" color="error" disabled={remove.isPending}>
            {t('section.delete')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
