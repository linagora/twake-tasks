import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography
} from '@linagora/twake-mui'
import { useId, type ReactElement } from 'react'
import { useNavigate } from 'react-router'

import { ApiError } from '@/application/boards'
import { ConfirmDialog } from '@/ds/ConfirmDialog'
import { isAdmin, isLastAdmin, type Board, type Person } from '@/domain/board'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'
import { useBoards, useLeaveBoard } from '@/ui/queries/boards'
import { useSharing } from '@/ui/queries/sharing'

/** What the Boards screen shows once someone has left a board. */
export interface LeftBoard {
  left: string
}

/**
 * Leaving a board leaves its project, so every board of it: the person is a
 * member of the project, not of a board.
 */
export function LeaveBoardDialog({
  board,
  self,
  onClose
}: {
  board: Board
  self: Person
  onClose: () => void
}): ReactElement | null {
  const { t } = useI18n()
  const navigate = useNavigate()
  const leave = useLeaveBoard(board.id)
  const boards = useBoards()
  const admin = isAdmin(board.role)
  // Only an admin may read the roles, and only an admin can be the last one.
  const sharing = useSharing(board.id, admin)
  const members = sharing.data?.members ?? []
  const role = members.find(member => member.userId === self.userId)
  const others = (boards.data ?? []).filter(
    summary =>
      summary.project.id === board.project.id && summary.id !== board.id
  ).length

  // Wait for the roles: the confirm dialog must not turn into the last admin one.
  if (admin && sharing.isPending) return null
  if (role && isLastAdmin(role, members)) {
    return <LastAdminDialog name={board.name} onClose={onClose} />
  }
  return (
    <ConfirmDialog
      labels={{
        title: t('leave.title', { name: board.name }),
        text:
          others > 0
            ? t('leave.textProject', {
                smart_count: others,
                project: board.project.name
              })
            : t('leave.text'),
        cancel: t('board.cancel'),
        confirm: t('leave.confirm')
      }}
      pending={leave.isPending || boards.isPending}
      error={
        leave.isError &&
        (leave.error instanceof ApiError && leave.error.code === 'last_admin'
          ? t('sharing.lastAdmin')
          : t('leave.failed'))
      }
      onCancel={onClose}
      onConfirm={() => {
        leave.mutate(self.userId, {
          onSuccess: () => {
            void navigate('/', {
              state: { left: board.name } satisfies LeftBoard
            })
          }
        })
      }}
    />
  )
}

function LastAdminDialog({
  name,
  onClose
}: {
  name: string
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="small">
      <DialogTitle id={titleId}>{t('leave.cannotTitle', { name })}</DialogTitle>
      <DialogContent>
        <Typography>{t('sharing.lastAdmin')}</Typography>
      </DialogContent>
      <DialogActions>
        <Button ref={focusOnMount} onClick={onClose}>
          {t('sharing.close')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
