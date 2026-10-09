import { Cross, Icon } from '@linagora/twake-icons'
import {
  Avatar,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  List
} from '@linagora/twake-mui'
import { useId, type ReactElement } from 'react'

import { AvatarStack } from '@/ds/Columns'
import { StackButton } from '@/ds/PageHeader'
import { PersonRow } from '@/ds/PeopleList'
import type { Board, Person } from '@/domain/board'
import { displayName } from '@/domain/person'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import { useI18n } from '@/ui/i18n/useI18n'

const SHOWN = 4

export function MemberStack({
  members,
  onClick
}: {
  members: Person[]
  onClick: () => void
}): ReactElement {
  const { t } = useI18n()
  const hidden = members.length - SHOWN
  return (
    <StackButton
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={t('members.count', { smart_count: members.length })}
    >
      <AvatarStack size={32}>
        {members.slice(0, SHOWN).map(person => (
          <PersonAvatar
            key={person.userId}
            email={person.email}
            name={person.name}
            avatar={person.avatar}
            size={32}
          />
        ))}
        {hidden > 0 && (
          <Avatar size={32} aria-hidden>
            {`+${String(hidden)}`}
          </Avatar>
        )}
      </AvatarStack>
    </StackButton>
  )
}

export function MembersDialog({
  board,
  onClose
}: {
  board: Board
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId}>
      <DialogTitle
        id={titleId}
        className="u-flex u-flex-items-center u-flex-justify-between"
      >
        <span className="u-ellipsis">{t('sharing.people')}</span>
        <IconButton
          aria-label={t('sharing.close')}
          onClick={onClose}
          className="u-ml-half"
        >
          <Icon icon={Cross} />
        </IconButton>
      </DialogTitle>
      <DialogContent className="u-pb-1-half">
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
