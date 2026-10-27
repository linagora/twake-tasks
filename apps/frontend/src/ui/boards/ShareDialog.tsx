import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  List,
  Typography
} from '@linagora/twake-mui'
import { useRef, useState, type ReactElement } from 'react'

import { ApiError } from '@/application/boards'
import { ClosableTitle } from '@/ds/ClosableTitle'
import type { PersonSuggestion } from '@/ds/PeopleList'
import {
  InviteField,
  MemberRole,
  MemberRow,
  MembersEmpty,
  MembersLoading,
  RemoveMember,
  RoleSelect,
  ShareSection,
  type RoleChoice
} from '@/ds/Sharing'
import { ROLES, type Board, type Role } from '@/domain/board'
import { displayName } from '@/domain/person'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import {
  useBoardChange,
  useBoards,
  usePeopleSuggestions,
  useSharing
} from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'
import { useSession } from '@/ui/session/SessionGate'

// What an address needs to be one, as the field of type email checked it.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Sharing a board as the Cozy new UI shares a file: the people to invite
 * with their role and Share, then the people with access, the person signed
 * in first. Boards have no link to share, so the dialog ends there.
 */
export function ShareDialog({
  board,
  onClose
}: {
  board: Board
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const { user } = useSession()
  const sharing = useSharing(board.id)
  const boards = useBoards()
  const [input, setInput] = useState('')
  const [chosen, setChosen] = useState<PersonSuggestion[]>([])
  const suggestions = usePeopleSuggestions(board.id, input)
  const [role, setRole] = useState<Role>('editor')
  const field = useRef<HTMLInputElement>(null)
  const invite = useBoardChange(
    board.id,
    async (api, { emails, role }: { emails: string[]; role: Role }) => {
      for (const email of emails) await api.invite(board.id, email, role)
    }
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
  // An invite keeps its role: another is a new invite in its place.
  const reinvite = useBoardChange(
    board.id,
    async (
      api,
      { inviteId, email, role }: { inviteId: string; email: string; role: Role }
    ) => {
      await api.cancelInvite(board.id, inviteId)
      await api.invite(board.id, email, role)
    }
  )
  // Clears the last action's message. A pending action keeps running: a
  // reset would drop its onSuccess and re-enable Send mid-request.
  const start = (): void => {
    for (const action of [invite, change, cancel, reinvite]) {
      if (!action.isPending) action.reset()
    }
  }
  const failure = invite.error ?? change.error ?? cancel.error ?? reinvite.error
  const roles: RoleChoice<Role>[] = ROLES.map(each => ({
    value: each,
    label: t(`sharing.roles.${each}`)
  }))
  const roleName = (each: Role) => t(`sharing.roles.${each}`)
  const me = user.email?.toLowerCase()
  const members = sharing.data?.members ?? []
  const self = members.find(member => member.email.toLowerCase() === me)
  const others = members.filter(member => member !== self)
  const admins = members.filter(member => member.role === 'admin').length
  const invites = sharing.data?.invites ?? []
  const projectBoards = boards.data && [
    board.name,
    ...boards.data
      .filter(
        summary =>
          summary.project.id === board.project.id && summary.id !== board.id
      )
      .map(summary => summary.name)
  ]
  const reach =
    projectBoards &&
    (projectBoards.length > 1
      ? t('sharing.helpProject', {
          project: board.project.name,
          boards:
            projectBoards.length > 5
              ? `${projectBoards.slice(0, 5).join(', ')} ${t(
                  'sharing.helpMore',
                  { smart_count: projectBoards.length - 5 }
                )}`
              : projectBoards.join(', ')
        })
      : t('sharing.helpSingle'))
  const typed = (text: string): PersonSuggestion | null => {
    const email = text.trim().toLowerCase()
    return EMAIL.test(email)
      ? {
          key: email,
          value: email,
          label: email,
          avatar: <PersonAvatar email={email} size={24} />
        }
      : null
  }
  const send = (): void => {
    // A last address typed, not yet a chip, goes too.
    const last = typed(input)
    const emails = [
      ...new Set([
        ...chosen.map(each => each.value),
        ...(last ? [last.value] : [])
      ])
    ]
    if (emails.length === 0) return
    start()
    field.current?.focus()
    invite.mutate(
      { emails, role },
      {
        onSuccess: () => {
          setChosen([])
          setInput('')
        }
      }
    )
  }
  const lastAdmin = (memberRole: Role) =>
    memberRole === 'admin' && admins === 1 ? t('sharing.lastAdmin') : undefined

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <ClosableTitle
        title={t('sharing.title', { name: board.name })}
        closeLabel={t('sharing.close')}
        onClose={onClose}
      />
      <DialogContent className="u-pt-0 u-pb-2">
        {failure && (
          <Alert
            severity="error"
            role="alert"
            className="u-mt-1"
            onClose={start}
          >
            {failure instanceof ApiError && failure.code === 'last_admin'
              ? t('sharing.lastAdmin')
              : t('sharing.failed')}
          </Alert>
        )}
        {sharing.isError && (
          <Alert severity="error" role="alert" className="u-mt-1">
            {t('sharing.loadFailed')}
          </Alert>
        )}
        <ShareSection title={t('sharing.inviteUsers')}>
          <InviteField
            label={t('sharing.email')}
            placeholder={t('sharing.addContacts')}
            chosen={chosen}
            onChoose={next => {
              setChosen(next)
              setInput('')
            }}
            input={input}
            onInput={setInput}
            suggestions={(suggestions.data ?? []).map(person => ({
              key: person.userId,
              value: person.email.toLowerCase(),
              label: displayName(person),
              detail:
                displayName(person) === person.email ? undefined : person.email,
              avatar: (
                <PersonAvatar
                  email={person.email}
                  name={person.name}
                  avatar={person.avatar}
                  size={24}
                />
              )
            }))}
            toPerson={typed}
            inputRef={field}
            role={
              <RoleSelect
                label={t('sharing.roleOf', { role: roleName(role) })}
                value={role}
                roles={roles}
                onChange={setRole}
              />
            }
            send={
              <Button
                variant="contained"
                disabled={
                  invite.isPending ||
                  (chosen.length === 0 && typed(input) === null)
                }
                onClick={send}
              >
                {t('sharing.share')}
              </Button>
            }
          />
          {/* Who an invite reaches, which the design has no place for. */}
          <Typography variant="caption" color="textSecondary">
            {reach && `${reach} `}
            {t('sharing.sameOrganization')}
          </Typography>
          {sharing.isPending ? (
            <MembersLoading />
          ) : (
            <List disablePadding aria-label={t('sharing.people')}>
              {self && (
                <MemberRow
                  label={t('sharing.you')}
                  detail={self.email}
                  avatar={
                    <PersonAvatar
                      email={self.email}
                      name={self.name}
                      avatar={self.avatar}
                      size={32}
                    />
                  }
                >
                  <MemberRole>{roleName(self.role)}</MemberRole>
                </MemberRow>
              )}
              {others.map(member => (
                <MemberRow
                  key={member.userId}
                  label={displayName(member)}
                  detail={
                    displayName(member) === member.email
                      ? undefined
                      : member.email
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
                  <RoleSelect
                    label={t('sharing.roleOfPerson', {
                      person: displayName(member),
                      role: roleName(member.role)
                    })}
                    value={member.role}
                    roles={roles}
                    locked={lastAdmin(member.role)}
                    onChange={next => {
                      start()
                      change.mutate({ userId: member.userId, role: next })
                    }}
                  />
                  <RemoveMember
                    label={t('sharing.removePerson', {
                      person: displayName(member)
                    })}
                    why={lastAdmin(member.role)}
                    onClick={() => {
                      start()
                      field.current?.focus()
                      change.mutate({ userId: member.userId, role: null })
                    }}
                  />
                </MemberRow>
              ))}
              {invites.map(pending => (
                <MemberRow
                  key={pending.id}
                  label={pending.email}
                  detail={t('sharing.invitationSent')}
                  avatar={<PersonAvatar email={pending.email} size={32} />}
                >
                  <RoleSelect
                    label={t('sharing.roleOfPerson', {
                      person: pending.email,
                      role: roleName(pending.role)
                    })}
                    value={pending.role}
                    roles={roles}
                    disabled={reinvite.isPending}
                    onChange={next => {
                      start()
                      reinvite.mutate({
                        inviteId: pending.id,
                        email: pending.email,
                        role: next
                      })
                    }}
                  />
                  <RemoveMember
                    label={t('sharing.cancelInviteOf', {
                      person: pending.email
                    })}
                    onClick={() => {
                      start()
                      field.current?.focus()
                      cancel.mutate(pending.id)
                    }}
                  />
                </MemberRow>
              ))}
            </List>
          )}
          {!sharing.isPending &&
            !sharing.isError &&
            others.length === 0 &&
            invites.length === 0 && (
              <MembersEmpty
                title={t('sharing.emptyTitle')}
                subtitle={t('sharing.emptySubtitle')}
              />
            )}
        </ShareSection>
      </DialogContent>
    </Dialog>
  )
}
