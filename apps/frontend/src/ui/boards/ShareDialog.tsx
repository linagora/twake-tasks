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

import { ApiError } from '@/application/boards'
import { ROLES, type Board, type Role } from '@/domain/board'
import { useBoardChange, useProjects, useSharing } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

function RoleSelect({
  value,
  onChange
}: {
  value: Role
  onChange: (role: Role) => void
}): ReactElement {
  const { t } = useI18n()
  return (
    <TextField
      select
      size="small"
      className="u-flex-shrink-0"
      label={t('sharing.role')}
      value={value}
      onChange={event => {
        onChange(event.target.value as Role)
      }}
      slotProps={{ select: { native: true } }}
    >
      {ROLES.map(role => (
        <option key={role} value={role}>
          {t(`sharing.roles.${role}`)}
        </option>
      ))}
    </TextField>
  )
}

function MoveToProject({
  board,
  onMoved
}: {
  board: Board
  onMoved: () => void
}): ReactElement | null {
  const { t } = useI18n()
  const projects = useProjects()
  const [projectId, setProjectId] = useState('')
  const move = useBoardChange(board.id, (api, to: string) =>
    api.moveToProject(board.id, to)
  )
  const targets =
    projects.data?.filter(
      project =>
        project.role !== 'viewer' &&
        !project.personal &&
        project.id !== board.project.id
    ) ?? []
  if (targets.length === 0) return null

  return (
    <form
      aria-label={t('sharing.moveTitle')}
      className="u-flex u-flex-items-center u-mt-2"
      onSubmit={event => {
        event.preventDefault()
        move.mutate(projectId, { onSuccess: onMoved })
      }}
    >
      <TextField
        select
        size="small"
        className="u-mr-1"
        label={t('sharing.project')}
        value={projectId}
        onChange={event => {
          setProjectId(event.target.value)
        }}
        helperText={t('sharing.moveHelp')}
        slotProps={{ select: { native: true } }}
      >
        <option value="" />
        {targets.map(project => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </TextField>
      <Button type="submit" disabled={!projectId || move.isPending}>
        {t('sharing.move')}
      </Button>
      {move.isError && (
        <Typography role="alert" className="u-ml-1">
          {move.error instanceof ApiError &&
          move.error.code === 'key_prefix_taken'
            ? t('sharing.prefixTaken', { prefix: board.keyPrefix })
            : t('sharing.moveFailed')}
        </Typography>
      )}
    </form>
  )
}

export function ShareDialog({
  board,
  onClose
}: {
  board: Board
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const sharing = useSharing(board.id)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('viewer')
  const [invited, setInvited] = useState<string | null>(null)
  const invite = useBoardChange(board.id, (api, to: string) =>
    api.invite(board.id, to, role)
  )
  const change = useBoardChange(
    board.id,
    (api, { userId, role }: { userId: string; role: Role | null }) =>
      role
        ? api.setMemberRole(board.id, userId, role)
        : api.removeMember(board.id, userId)
  )
  const cancel = useBoardChange(board.id, (api, inviteId: string) =>
    api.cancelInvite(board.id, inviteId)
  )

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth>
      <DialogTitle id={titleId}>
        {t('sharing.title', { name: board.name })}
      </DialogTitle>
      <DialogContent>
        <form
          aria-label={t('sharing.invite')}
          className="u-flex u-flex-wrap u-flex-items-center u-mt-half"
          onSubmit={event => {
            event.preventDefault()
            const to = email.trim().toLowerCase()
            invite.mutate(to, {
              onSuccess: () => {
                setInvited(to)
                setEmail('')
              }
            })
          }}
        >
          <TextField
            label={t('sharing.email')}
            type="email"
            size="small"
            className="u-mr-1 u-mb-half-m"
            value={email}
            onChange={event => {
              setEmail(event.target.value)
            }}
            slotProps={{ htmlInput: { maxLength: 254 } }}
          />
          <RoleSelect value={role} onChange={setRole} />
          <Button
            type="submit"
            className="u-ml-1"
            disabled={invite.isPending || !email.trim()}
          >
            {t('sharing.invite')}
          </Button>
        </form>
        {invited && (
          <Typography role="status" className="u-mt-1">
            {t('sharing.invited', { email: invited })}
          </Typography>
        )}
        {(invite.isError || change.isError || cancel.isError) && (
          <Typography role="alert" className="u-mt-1">
            {t('sharing.failed')}
          </Typography>
        )}
        {sharing.isError && (
          <Typography role="alert" className="u-mt-1">
            {t('sharing.loadFailed')}
          </Typography>
        )}
        <ul className="u-mt-1">
          {sharing.data?.members.map(member => (
            <li
              key={member.userId}
              aria-label={member.email}
              className="u-flex u-flex-wrap u-flex-items-center u-mb-half"
            >
              <Typography className="u-mr-auto">{member.email}</Typography>
              <RoleSelect
                value={member.role}
                onChange={next => {
                  change.mutate({ userId: member.userId, role: next })
                }}
              />
              <Button
                variant="text"
                onClick={() => {
                  change.mutate({ userId: member.userId, role: null })
                }}
              >
                {t('sharing.remove')}
              </Button>
            </li>
          ))}
          {sharing.data?.invites.map(pending => (
            <li
              key={pending.id}
              aria-label={pending.email}
              className="u-flex u-flex-wrap u-flex-items-center u-mb-half"
            >
              <Typography className="u-mr-auto">{pending.email}</Typography>
              <Typography variant="caption" className="u-mr-1">
                {t('sharing.pending', {
                  role: t(`sharing.roles.${pending.role}`)
                })}
              </Typography>
              <Button
                variant="text"
                onClick={() => {
                  cancel.mutate(pending.id)
                }}
              >
                {t('sharing.cancelInvite')}
              </Button>
            </li>
          ))}
        </ul>
        <MoveToProject board={board} onMoved={onClose} />
      </DialogContent>
      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {t('sharing.close')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
