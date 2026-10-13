import { Check, Icon } from '@linagora/twake-icons'
import {
  Button,
  Chip,
  Dialog,
  DialogContent,
  Divider,
  DropdownButton,
  List,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography
} from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'

import { ApiError } from '@/application/boards'
import { ClosableTitle } from '@/ds/ClosableTitle'
import { MenuHint } from '@/ds/MenuHint'
import { InviteRow, PersonCombobox, PersonRow } from '@/ds/PeopleList'
import { ROLES, type Board, type Role } from '@/domain/board'
import { displayName } from '@/domain/person'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import {
  useBoardChange,
  usePeopleSuggestions,
  useSharing
} from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

function RoleMenu({
  value,
  person,
  lastAdmin = false,
  onChange,
  action
}: {
  value: Role
  person?: string
  lastAdmin?: boolean
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
        aria-label={
          person
            ? t('sharing.roleOfPerson', { person, role: label })
            : t('sharing.roleOf', { role: label })
        }
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
        {lastAdmin && <MenuHint>{t('sharing.lastAdmin')}</MenuHint>}
        {onChange &&
          ROLES.map(role => (
            <MenuItem
              key={role}
              selected={role === value}
              disabled={lastAdmin && role !== value}
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
            disabled={lastAdmin}
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
  const sharing = useSharing(board.id)
  const [email, setEmail] = useState('')
  const suggestions = usePeopleSuggestions(board.id, email)
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
  // Each action replaces the message of the one before, so a stale
  // "Invited" or error never sits next to the outcome of a later action.
  const start = (): void => {
    setInvited(null)
    invite.reset()
    change.reset()
    cancel.reset()
  }
  const failure = invite.error ?? change.error ?? cancel.error
  const admins =
    sharing.data?.members.filter(member => member.role === 'admin').length ?? 0

  return (
    <Dialog open onClose={onClose}>
      <ClosableTitle
        title={t('sharing.title', { name: board.name })}
        closeLabel={t('sharing.close')}
        onClose={onClose}
      />
      <DialogContent className="u-pb-1-half">
        <Typography variant="body2" color="textSecondary" className="u-mb-1">
          {t('sharing.help', { project: board.project.name })}
        </Typography>
        <InviteRow
          label={t('sharing.invite')}
          onSubmit={() => {
            const to = email.trim().toLowerCase()
            start()
            invite.mutate(to, {
              onSuccess: () => {
                setInvited(to)
                setEmail('')
              }
            })
          }}
        >
          <PersonCombobox
            label={t('sharing.email')}
            type="email"
            maxLength={254}
            value={email}
            onChange={setEmail}
            suggestions={(suggestions.data ?? []).map(person => ({
              key: person.userId,
              value: person.email,
              label: displayName(person),
              detail:
                displayName(person) === person.email ? undefined : person.email,
              avatar: (
                <PersonAvatar
                  email={person.email}
                  name={person.name}
                  avatar={person.avatar}
                  size={32}
                />
              )
            }))}
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
        {failure && (
          <Typography role="alert" color="error" className="u-mt-1">
            {failure instanceof ApiError && failure.code === 'last_admin'
              ? t('sharing.lastAdmin')
              : t('sharing.failed')}
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
                  avatar={member.avatar}
                  size={32}
                />
              }
            >
              <RoleMenu
                value={member.role}
                person={displayName(member)}
                lastAdmin={member.role === 'admin' && admins === 1}
                onChange={next => {
                  start()
                  change.mutate({ userId: member.userId, role: next })
                }}
                action={{
                  label: t('sharing.remove'),
                  run: () => {
                    start()
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
                person={pending.email}
                action={{
                  label: t('sharing.cancelInvite'),
                  run: () => {
                    start()
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
