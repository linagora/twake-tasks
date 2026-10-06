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

import { ApiError, type Project } from '@/application/boards'
import type { Board } from '@/domain/board'
import { useBoardChange, useProjects } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

export function useMoveTargets(board: Board): Project[] {
  const projects = useProjects()
  return (
    projects.data?.filter(
      project =>
        project.role !== 'viewer' &&
        !project.personal &&
        project.id !== board.project.id
    ) ?? []
  )
}

export function MoveBoardDialog({
  board,
  onClose
}: {
  board: Board
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const targets = useMoveTargets(board)
  const [projectId, setProjectId] = useState('')
  const move = useBoardChange(board.id, (api, to: string) =>
    api.moveToProject(board.id, to)
  )

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="small">
      <form
        onSubmit={event => {
          event.preventDefault()
          move.mutate(projectId, { onSuccess: onClose })
        }}
      >
        <DialogTitle id={titleId}>
          {t('moveBoard.title', { name: board.name })}
        </DialogTitle>
        <DialogContent>
          <TextField
            select
            fullWidth
            margin="dense"
            label={t('moveBoard.project')}
            value={projectId}
            onChange={event => {
              setProjectId(event.target.value)
            }}
            helperText={t('moveBoard.help')}
            slotProps={{
              select: { native: true },
              inputLabel: { shrink: true }
            }}
          >
            <option value="" />
            {targets.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </TextField>
          {move.isError && (
            <Typography role="alert" color="error" className="u-mt-1">
              {move.error instanceof ApiError &&
              move.error.code === 'key_prefix_taken'
                ? t('moveBoard.prefixTaken', { prefix: board.keyPrefix })
                : t('moveBoard.failed')}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={onClose}>
            {t('moveBoard.cancel')}
          </Button>
          <Button type="submit" disabled={!projectId || move.isPending}>
            {t('moveBoard.move')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
