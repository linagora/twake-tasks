import { Typography } from '@linagora/twake-mui'
import { useState, type ReactElement, type ReactNode } from 'react'

import { Highlight } from '@/ds/Highlight'
import {
  PickerEmpty,
  PickerGroup,
  PickerOption,
  PickerPopover,
  PickerUnavailable
} from '@/ds/Picker'
import type { Person, Task } from '@/domain/board'
import { displayName } from '@/domain/person'
import { matchingPeople, suggestionOrder } from '@/ui/boards/people'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import { useSharing } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'
import { useSession } from '@/ui/session/SessionGate'

/** The members to check, the `pinned` ones first; saving is the caller's. */
export function PeopleMenu({
  label,
  boardId,
  members,
  tasks,
  shareable,
  pinned,
  chosen,
  onToggle,
  anchor,
  onClose,
  footer
}: {
  label: string
  boardId: string
  members: Person[]
  tasks: Task[]
  /** Whether the user may see the board's pending invites. */
  shareable: boolean
  pinned: Set<string>
  chosen: Set<string>
  onToggle: (userId: string) => void
  anchor: HTMLElement
  onClose: () => void
  footer?: ReactNode
}): ReactElement {
  const { t } = useI18n()
  const { user } = useSession()
  const [search, setSearch] = useState('')

  const ordered = suggestionOrder(members, pinned, user.email, tasks)
  const query = search.trim()
  const shown = matchingPeople(ordered, query)
  const sharing = useSharing(boardId, shareable)
  const invited = matchingPeople(
    (sharing.data?.invites ?? []).map(({ id, email }) => ({
      userId: id,
      email,
      name: null
    })),
    query
  )

  return (
    <PickerPopover
      label={label}
      anchor={anchor}
      onClose={onClose}
      searchLabel={t('board.searchPeople')}
      search={search}
      onSearch={setSearch}
      onPickFirst={() => {
        if (shown[0]) onToggle(shown[0].userId)
      }}
      footer={footer}
    >
      {shown.map(person => (
        <PickerOption
          key={person.userId}
          checked={chosen.has(person.userId)}
          onToggle={() => {
            onToggle(person.userId)
          }}
          start={
            <PersonAvatar
              email={person.email}
              name={person.name}
              avatar={person.avatar}
            />
          }
        >
          <Typography variant="body2" className="u-ellipsis">
            <Highlight text={displayName(person)} query={query} />
          </Typography>
          {displayName(person) !== person.email && (
            <Typography
              variant="caption"
              color="textSecondary"
              component="div"
              className="u-ellipsis"
            >
              <Highlight text={person.email} query={query} />
            </Typography>
          )}
        </PickerOption>
      ))}
      {invited.length > 0 && (
        <PickerGroup>{t('board.pendingGroup')}</PickerGroup>
      )}
      {invited.map(person => (
        <PickerUnavailable
          key={person.userId}
          start={<PersonAvatar email={person.email} />}
          hint={t('board.pendingHint')}
        >
          <Highlight text={person.email} query={query} />
        </PickerUnavailable>
      ))}
      {shown.length === 0 && invited.length === 0 && (
        <PickerEmpty>{t('board.noPeopleMatch', { search: query })}</PickerEmpty>
      )}
    </PickerPopover>
  )
}
