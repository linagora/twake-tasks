import {
  Avatar,
  Dialog,
  DialogContent,
  List,
  Tooltip,
  Typography
} from '@linagora/twake-mui'
import type { ReactElement } from 'react'

import { ClosableTitle } from '@/ds/ClosableTitle'
import { AvatarStack } from '@/ds/Columns'
import { StackButton } from '@/ds/PageHeader'
import { PersonRow } from '@/ds/PeopleList'
import type { Board, Person } from '@/domain/board'
import { displayName } from '@/domain/person'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import { useI18n } from '@/ui/i18n/useI18n'

// As Twake Drive shows the people a file is shared with, in its list.
const SHOWN = 3
const MAX_COUNT = 99

/**
 * The first members of a board side by side, the rest counted. `named` names
 * the rest on the count's hover, unless a tooltip already covers the stack.
 */
export function PeopleAvatars({
  members,
  size,
  named = true
}: {
  members: (Person & { pending?: boolean })[]
  size: number
  named?: boolean
}): ReactElement {
  const shown = members.slice(0, SHOWN)
  const hidden = members.slice(SHOWN)
  const count = (
    <Avatar size={size} color="none" border innerBorder aria-hidden>
      {`+${String(Math.min(hidden.length, MAX_COUNT))}`}
    </Avatar>
  )
  return (
    <AvatarStack size={size}>
      {shown.map(person => (
        <PersonAvatar
          key={person.userId}
          email={person.email}
          name={person.name}
          avatar={person.avatar}
          size={size}
          pending={person.pending}
        />
      ))}
      {hidden.length > 0 &&
        (named ? (
          <Tooltip
            title={hidden.map(person => displayName(person)).join(', ')}
            describeChild
          >
            {count}
          </Tooltip>
        ) : (
          count
        ))}
    </AvatarStack>
  )
}

/**
 * The first members of a board side by side, then the people it invited,
 * greyed until they sign in, the rest counted.
 */
export function MemberStack({
  members,
  invited,
  onClick
}: {
  members: Person[]
  invited: string[]
  onClick: () => void
}): ReactElement {
  const { t } = useI18n()
  const people = [
    ...members,
    ...invited.map(email => ({
      userId: email,
      email,
      name: null,
      avatar: null,
      pending: true
    }))
  ]
  const label = [
    t('members.count', { smart_count: members.length }),
    ...(invited.length > 0
      ? [t('members.invitedCount', { smart_count: invited.length })]
      : [])
  ].join(', ')
  return (
    <Tooltip title={label}>
      <StackButton onClick={onClick} aria-haspopup="dialog" aria-label={label}>
        <PeopleAvatars members={people} size={32} named={false} />
      </StackButton>
    </Tooltip>
  )
}

export function MembersDialog({
  board,
  reason,
  onClose
}: {
  board: Board
  reason: string | null
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  return (
    <Dialog open onClose={onClose}>
      <ClosableTitle
        title={t('sharing.people')}
        closeLabel={t('sharing.close')}
        onClose={onClose}
      />
      <DialogContent className="u-pb-1-half">
        {reason && (
          <Typography variant="body2" color="textSecondary" className="u-mb-1">
            {reason}
          </Typography>
        )}
        <List dense>
          {board.members.map(member => (
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
              {null}
            </PersonRow>
          ))}
        </List>
      </DialogContent>
    </Dialog>
  )
}
