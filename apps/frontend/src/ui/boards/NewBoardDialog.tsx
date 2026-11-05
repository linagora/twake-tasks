import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  FormControlLabel,
  FormGroup,
  TextField
} from '@linagora/twake-mui'
import { useId, useState, type ReactElement } from 'react'

import { ApiError, type BoardCopy, type Project } from '@/application/boards'
import { ClosableTitle } from '@/ds/ClosableTitle'
import { isAdmin, type Board, type BoardSummary } from '@/domain/board'
import {
  useBoards,
  useCreateBoard,
  useKeyPrefixCheck,
  useProjects
} from '@/ui/queries/boards'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'

function suggestedPrefix(name: string): string {
  return name
    .normalize('NFD')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^[0-9]+/, '')
    .slice(0, 3)
}

const NEW_PROJECT = 'new'

function useBoardTemplates(): BoardSummary[] {
  return (useBoards().data ?? [])
    .filter(board => board.boardTemplate && !board.archived)
    .sort((a, b) => a.name.localeCompare(b.name))
}

// The projects a copy may go to, the board's own first. An embed shows one
// project, so the copy stays in it to open there.
function useCopyTargets(
  projectId: string | undefined,
  embedded: boolean
): Project[] | undefined {
  const projects = useProjects().data
  if (!projects) return undefined
  if (embedded) return projects.filter(({ id }) => id === projectId)
  return projects
    .filter(project => isAdmin(project.role) && !project.personal)
    .sort((a, b) => Number(b.id === projectId) - Number(a.id === projectId))
}

/** With `copying`, a copy of that board; else a new board, maybe from a board template. */
export function NewBoardDialog({
  copying,
  embedded = false,
  onClose,
  onCreated
}: {
  copying?: Board | undefined
  embedded?: boolean
  onClose: () => void
  onCreated: (board: Board) => void
}): ReactElement {
  const { t, lang } = useI18n()
  const titleId = useId()
  const [name, setName] = useState(
    copying ? t('copyBoard.defaultName', { name: copying.name }) : ''
  )
  const [typedPrefix, setTypedPrefix] = useState<string | null>(null)
  const wanted = typedPrefix ?? suggestedPrefix(name)
  const check = useKeyPrefixCheck(wanted)
  const taken = check?.available === false
  // A prefix made from the name gives way to a free one; a typed one is the
  // person's choice, which they swap themselves.
  const proposed = typedPrefix === null && taken ? check.suggestion : null
  const keyPrefix = proposed ?? wanted
  const create = useCreateBoard()

  const templates = useBoardTemplates()
  const [templateId, setTemplateId] = useState('')
  const template = templates.find(({ id }) => id === templateId)
  const targets = useCopyTargets(copying?.project.id, embedded)
  const [chosenProject, setChosenProject] = useState<string | null>(null)
  const projectId =
    chosenProject ??
    (embedded || targets?.some(({ id }) => id === copying?.project.id)
      ? (copying?.project.id ?? NEW_PROJECT)
      : NEW_PROJECT)
  const [withTasks, setWithTasks] = useState(true)
  const [assignees, setAssignees] = useState(true)
  const [dueDates, setDueDates] = useState(false)
  const copyOf: BoardCopy | undefined = copying
    ? {
        boardId: copying.id,
        tasks: withTasks,
        assignees: withTasks && assignees,
        dueDates: withTasks && dueDates
      }
    : template && {
        boardId: template.id,
        tasks: true,
        assignees: false,
        dueDates: false
      }

  const error = create.error
  const refused =
    error instanceof ApiError &&
    error.code === 'key_prefix_taken' &&
    create.variables?.keyPrefix === keyPrefix
  const prefixTaken = refused || (typedPrefix !== null && taken)
  const freePrefix =
    prefixTaken && taken && check.suggestion !== keyPrefix
      ? check.suggestion
      : null
  const option = (
    label: string,
    checked: boolean,
    set: (checked: boolean) => void,
    disabled = false
  ) => (
    <FormControlLabel
      label={label}
      disabled={disabled}
      control={
        <Checkbox
          checked={checked}
          onChange={event => {
            set(event.target.checked)
          }}
        />
      }
    />
  )

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="small">
      <form
        onSubmit={event => {
          event.preventDefault()
          create.mutate(
            {
              name: name.trim(),
              keyPrefix,
              language: lang,
              ...(copying && projectId !== NEW_PROJECT && { projectId }),
              ...(copyOf && { copyOf })
            },
            { onSuccess: onCreated }
          )
        }}
      >
        <ClosableTitle
          id={titleId}
          title={
            copying
              ? t('copyBoard.title', { name: copying.name })
              : t('newBoard.title')
          }
          closeLabel={t('newBoard.close')}
          onClose={onClose}
        />
        <DialogContent>
          <TextField
            label={t('newBoard.name')}
            value={name}
            onChange={event => {
              setName(event.target.value)
            }}
            required
            fullWidth
            margin="dense"
            inputRef={focusOnMount}
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            label={t('newBoard.keyPrefix')}
            value={keyPrefix}
            onChange={event => {
              setTypedPrefix(event.target.value.toUpperCase())
              create.reset()
            }}
            required
            fullWidth
            margin="dense"
            error={prefixTaken}
            helperText={
              prefixTaken
                ? t('newBoard.keyPrefixTaken', { prefix: keyPrefix })
                : proposed
                  ? t('newBoard.keyPrefixProposed', {
                      prefix: wanted,
                      suggestion: proposed
                    })
                  : t('newBoard.keyPrefixHelp')
            }
            slotProps={{
              htmlInput: { maxLength: 10, pattern: '[A-Z][A-Z0-9]*' }
            }}
          />
          {freePrefix && (
            <Button
              variant="text"
              size="small"
              onClick={() => {
                setTypedPrefix(freePrefix)
                create.reset()
              }}
            >
              {t('newBoard.useKeyPrefix', { prefix: freePrefix })}
            </Button>
          )}
          {copying ? (
            <>
              <TextField
                select
                fullWidth
                margin="dense"
                label={t('copyBoard.project')}
                value={projectId}
                onChange={event => {
                  setChosenProject(event.target.value)
                }}
                helperText={t('copyBoard.projectHelp')}
                slotProps={{
                  select: { native: true },
                  inputLabel: { shrink: true }
                }}
              >
                {targets?.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
                {!embedded && (
                  <option value={NEW_PROJECT}>
                    {t('copyBoard.newProject')}
                  </option>
                )}
              </TextField>
              <FormGroup className="u-mt-1">
                {option(t('copyBoard.tasks'), withTasks, setWithTasks)}
                <FormGroup className="u-pl-2">
                  {option(
                    t('copyBoard.assignees'),
                    withTasks && assignees,
                    setAssignees,
                    !withTasks
                  )}
                  {option(
                    t('copyBoard.dueDates'),
                    withTasks && dueDates,
                    setDueDates,
                    !withTasks
                  )}
                </FormGroup>
              </FormGroup>
            </>
          ) : (
            templates.length > 0 && (
              <TextField
                select
                fullWidth
                margin="dense"
                label={t('newBoard.startFrom')}
                value={templateId}
                onChange={event => {
                  setTemplateId(event.target.value)
                }}
                helperText={
                  template &&
                  t('newBoard.fromTemplate', {
                    smart_count: template.openTasks
                  })
                }
                slotProps={{
                  select: { native: true },
                  inputLabel: { shrink: true }
                }}
              >
                <option value="">{t('newBoard.emptyBoard')}</option>
                {templates.map(board => (
                  <option key={board.id} value={board.id}>
                    {board.name}
                  </option>
                ))}
              </TextField>
            )
          )}
          {error && !prefixTaken && (
            <p role="alert">
              {t(copying ? 'copyBoard.failed' : 'newBoard.failed')}
            </p>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            type="submit"
            disabled={
              create.isPending ||
              !name.trim() ||
              (copying !== undefined && targets === undefined)
            }
          >
            {t(copying ? 'copyBoard.copy' : 'newBoard.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
