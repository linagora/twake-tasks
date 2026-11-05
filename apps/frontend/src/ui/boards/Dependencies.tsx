import { Plus, Relationship } from '@linagora/twake-icons'
import {
  IconButton,
  Link,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  Typography
} from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'
import { Link as RouterLink, useParams } from 'react-router'

import { ApiError, type LinkedTask, type LinkKind } from '@/application/boards'
import { Row } from '@/ds/Columns'
import { Icon } from '@/ds/Icon'
import { PickerEmpty, PickerPopover } from '@/ds/Picker'
import { Property } from '@/ds/SidePanel'
import {
  TaskLinkGroup,
  TaskLinkItem,
  TaskLinks,
  TaskLinkWarning
} from '@/ds/TaskLinks'
import type { Board, Task } from '@/domain/board'
import { useAddLink, useLinks, useRemoveLink } from '@/ui/queries/links'
import { searchMinLength, useSearch } from '@/ui/queries/search'
import { useI18n } from '@/ui/i18n/useI18n'

const KINDS = ['blockedBy', 'blocks'] as const

export function Dependencies({
  task,
  boardId,
  board,
  editable
}: {
  task: Task
  boardId: string
  board: Board | undefined
  editable: boolean
}): ReactElement {
  const { t } = useI18n()
  const links = useLinks(boardId, task.id)
  const remove = useRemoveLink(boardId, task.id)
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [picking, setPicking] = useState<{
    kind: LinkKind
    anchor: HTMLElement
  } | null>(null)
  const data = links.data
  const kinds = KINDS.filter(kind => (data?.[kind].length ?? 0) > 0)
  const blocking = (data?.blockedBy ?? []).flatMap(link =>
    link.task && !link.task.done ? [link.task] : []
  )
  const earlier = blocking.filter(
    blocker =>
      task.dueDate !== null &&
      blocker.dueDate !== null &&
      task.dueDate < blocker.dueDate
  )

  return (
    <Property
      icon={<Icon icon={Relationship} />}
      label={t('task.dependencies')}
    >
      <TaskLinks label={t('task.dependencies')}>
        {kinds.map(kind => (
          <TaskLinkGroup
            key={kind}
            label={t(`dependencies.${kind}`)}
            notes={
              kind === 'blockedBy' &&
              earlier.map(blocker => (
                <TaskLinkWarning key={blocker.key}>
                  {t('dependencies.dueBefore', { key: blocker.key })}
                </TaskLinkWarning>
              ))
            }
          >
            {data?.[kind].map(link => (
              <LinkRow
                key={link.taskId}
                link={link}
                boardId={boardId}
                remove={
                  editable
                    ? {
                        label: t('dependencies.remove', {
                          key: link.task?.key ?? t('dependencies.hidden')
                        }),
                        disabled: remove.isPending,
                        onClick: () => {
                          remove.mutate(link.taskId)
                        }
                      }
                    : undefined
                }
              />
            ))}
          </TaskLinkGroup>
        ))}
        {remove.isError && (
          <Typography role="alert" variant="caption" color="error">
            {t('dependencies.failed')}
          </Typography>
        )}
        <Row>
          {kinds.length === 0 && (
            <Typography variant="body2" color="textSecondary">
              {links.isError
                ? t('dependencies.loadFailed')
                : t('dependencies.none')}
            </Typography>
          )}
          {editable && (
            <Tooltip title={t('dependencies.add')}>
              <IconButton
                size="small"
                aria-label={t('dependencies.add')}
                aria-haspopup="menu"
                aria-expanded={menu !== null}
                onClick={event => {
                  setMenu(event.currentTarget)
                }}
              >
                <Icon icon={Plus} size={14} />
              </IconButton>
            </Tooltip>
          )}
        </Row>
        <Menu
          anchorEl={menu}
          open={menu !== null}
          onClose={() => {
            setMenu(null)
          }}
        >
          {KINDS.map(kind => (
            <MenuItem
              key={kind}
              onClick={() => {
                if (menu) setPicking({ kind, anchor: menu })
                setMenu(null)
              }}
            >
              {t(`dependencies.${kind}Choice`)}
            </MenuItem>
          ))}
        </Menu>
        {picking && (
          <Picker
            task={task}
            boardId={boardId}
            board={board}
            kind={picking.kind}
            anchor={picking.anchor}
            linked={[...(data?.blockedBy ?? []), ...(data?.blocks ?? [])]}
            onClose={() => {
              setPicking(null)
            }}
          />
        )}
      </TaskLinks>
    </Property>
  )
}

function LinkRow({
  link,
  boardId,
  remove
}: {
  link: LinkedTask
  boardId: string
  remove: Parameters<typeof TaskLinkItem>[0]['remove']
}): ReactElement {
  const { t } = useI18n()
  const { projectId } = useParams()
  const linked = link.task
  if (!linked) {
    return (
      <TaskLinkItem
        taskKey={null}
        title={t('dependencies.hidden')}
        where=""
        done={false}
        remove={remove}
      />
    )
  }
  const here = linked.boardId === boardId
  const task = `?task=${encodeURIComponent(linked.key)}`
  // A project's frame opens only the boards of that project.
  const to = here
    ? task
    : projectId === undefined
      ? `/boards/${linked.boardId}${task}`
      : null
  return (
    <TaskLinkItem
      taskKey={linked.key}
      title={
        to ? (
          <Link
            component={RouterLink}
            to={to}
            underline="hover"
            color="inherit"
          >
            {linked.title}
          </Link>
        ) : (
          linked.title
        )
      }
      where={[here ? null : linked.boardName, linked.section]
        .filter(Boolean)
        .join(' · ')}
      done={linked.done}
      remove={remove}
    />
  )
}

function Picker({
  task,
  boardId,
  board,
  kind,
  anchor,
  linked,
  onClose
}: {
  task: Task
  boardId: string
  board: Board | undefined
  kind: LinkKind
  anchor: HTMLElement
  linked: LinkedTask[]
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)
  const results = useSearch(text, { status: 'open' })
  const add = useAddLink(boardId, task.id)
  const below = relativesOf(task, board?.tasks ?? [])
  const projectId = board?.project.id
  // Without an organization only the tasks of the same project can be
  // linked, so they come first.
  const found = (results.data ?? [])
    .filter(
      each =>
        each.id !== task.id &&
        !below.has(each.id) &&
        !linked.some(link => link.taskId === each.id)
    )
    .sort(
      (one, other) =>
        Number(other.projectId === projectId) -
        Number(one.projectId === projectId)
    )
    .slice(0, 8)
  const failure =
    add.error instanceof ApiError && add.error.code === 'link_cycle'
      ? t('dependencies.cycle', { key: chosen ?? '' })
      : add.error instanceof ApiError && add.error.code === 'invalid_link'
        ? t('dependencies.otherProject')
        : t('dependencies.failed')
  const pick = (other: { id: string; key: string }) => {
    setChosen(other.key)
    add.mutate({ kind, otherId: other.id }, { onSuccess: onClose })
  }

  return (
    <PickerPopover
      label={t(`dependencies.${kind}Choice`)}
      anchor={anchor}
      onClose={onClose}
      searchLabel={t('dependencies.search')}
      search={text}
      onSearch={next => {
        add.reset()
        setText(next)
      }}
      onPickFirst={() => {
        if (found[0]) pick(found[0])
      }}
      countLabel={count => t('picker.count', { smart_count: count })}
      footer={
        add.isError && (
          <Typography role="alert" variant="caption" color="error">
            {failure}
          </Typography>
        )
      }
    >
      {text.trim().length < searchMinLength() ? (
        <PickerEmpty>{t('dependencies.typeToSearch')}</PickerEmpty>
      ) : results.data && found.length === 0 ? (
        <PickerEmpty>{t('dependencies.noMatch')}</PickerEmpty>
      ) : (
        found.map(each => (
          <MenuItem
            key={each.id}
            disabled={add.isPending}
            onClick={() => {
              pick(each)
            }}
          >
            <ListItemText
              primary={`${each.key} ${each.title}`}
              secondary={each.boardName}
              slotProps={{
                primary: { noWrap: true, variant: 'body2' },
                secondary: { noWrap: true, variant: 'caption' }
              }}
            />
          </MenuItem>
        ))
      )}
    </PickerPopover>
  )
}

// Its sub-tasks and the tasks it is a sub-task of.
function relativesOf(task: Task, tasks: Task[]): Set<string> {
  const relatives = new Set<string>()
  const visit = (parentId: string) => {
    for (const each of tasks) {
      if (each.parentId === parentId && !relatives.has(each.id)) {
        relatives.add(each.id)
        visit(each.id)
      }
    }
  }
  visit(task.id)
  for (
    let parentId = task.parentId;
    parentId && !relatives.has(parentId);
    parentId = tasks.find(each => each.id === parentId)?.parentId ?? null
  ) {
    relatives.add(parentId)
  }
  return relatives
}
