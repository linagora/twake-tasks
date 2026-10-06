import { Check, Cross, Icon } from '@linagora/twake-icons'
import {
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  DropdownButton,
  IconButton,
  List,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  TextField,
  Typography
} from '@linagora/twake-mui'
import { useId, useState, type ReactElement } from 'react'

import { InviteRow, PersonRow } from '@/ds/PeopleList'
import { ROLES, type Board, type Role } from '@/domain/board'
import { displayName } from '@/domain/person'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import { useBoardChange, useSharing } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

function RoleMenu({
  value,
  onChange,
  action
}: {
  value: Role
  onChange?: (role: Role) => void
  action?: { label: string; run: () => void }
}): ReactElement {
  const { t } = useI18n()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const close = (): void => {
    setAnchor(null)
  }
  const label = t(`sharing.roles.${value}`)

  return (
    <>
      <DropdownButton
        textVariant="body2"
        aria-label={t('sharing.roleOf', { role: label })}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={event => {
          setAnchor(event.currentTarget)
        }}
      >
        {label}
      </DropdownButton>
      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {onChange &&
          ROLES.map(role => (
            <MenuItem
              key={role}
              selected={role === value}
              onClick={() => {
                close()
                if (role !== value) onChange(role)
              }}
            >
              <ListItemIcon>
                {role === value && <Icon icon={Check} />}
              </ListItemIcon>
              <ListItemText>{t(`sharing.roles.${role}`)}</ListItemText>
            </MenuItem>
          ))}
        {onChange && action && <Divider />}
        {action && (
          <MenuItem
            onClick={() => {
              close()
              action.run()
            }}
          >
            <ListItemText className="u-error">{action.label}</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </>
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
    <Dialog open onClose={onClose} aria-labelledby={titleId}>
      <DialogTitle
        id={titleId}
        className="u-flex u-flex-items-center u-flex-justify-between"
      >
        <span className="u-ellipsis">
          {t('sharing.title', { name: board.name })}
        </span>
        <IconButton
          aria-label={t('sharing.close')}
          onClick={onClose}
          className="u-ml-half"
        >
          <Icon icon={Cross} />
        </IconButton>
      </DialogTitle>
      <DialogContent className="u-pb-1-half">
        <InviteRow
          label={t('sharing.invite')}
          onSubmit={() => {
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
            value={email}
            onChange={event => {
              setEmail(event.target.value)
            }}
            slotProps={{ htmlInput: { maxLength: 254 } }}
          />
          <RoleMenu value={role} onChange={setRole} />
          <Button type="submit" disabled={invite.isPending || !email.trim()}>
            {t('sharing.invite')}
          </Button>
        </InviteRow>
        {invited && (
          <Typography role="status" variant="body2" className="u-mt-1">
            {t('sharing.invited', { email: invited })}
          </Typography>
        )}
        {(invite.isError || change.isError || cancel.isError) && (
          <Typography role="alert" color="error" className="u-mt-1">
            {t('sharing.failed')}
          </Typography>
        )}
        {sharing.isError && (
          <Typography role="alert" color="error" className="u-mt-1">
            {t('sharing.loadFailed')}
          </Typography>
        )}
        <Typography variant="subtitle2" className="u-mt-1-half">
          {t('sharing.people')}
        </Typography>
        <List dense>
          {sharing.data?.members.map(member => (
            <PersonRow
              key={member.userId}
              label={displayName(member)}
              detail={
                displayName(member) === member.email ? undefined : member.email
              }
              avatar={
                <PersonAvatar
                  email={member.email}
                  name={member.name}
                  size={32}
                />
              }
            >
              <RoleMenu
                value={member.role}
                onChange={next => {
                  change.mutate({ userId: member.userId, role: next })
                }}
                action={{
                  label: t('sharing.remove'),
                  run: () => {
                    change.mutate({ userId: member.userId, role: null })
                  }
                }}
              />
            </PersonRow>
          ))}
          {sharing.data?.invites.map(pending => (
            <PersonRow
              key={pending.id}
              label={pending.email}
              avatar={<PersonAvatar email={pending.email} size={32} />}
            >
              <Chip size="small" label={t('sharing.pending')} />
              <RoleMenu
                value={pending.role}
                action={{
                  label: t('sharing.cancelInvite'),
                  run: () => {
                    cancel.mutate(pending.id)
                  }
                }}
              />
            </PersonRow>
          ))}
        </List>
      </DialogContent>
    </Dialog>
  )
}
