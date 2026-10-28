import { People } from '@linagora/twake-icons'
import { Avatar, TextField, Typography } from '@linagora/twake-mui'
import { useRef, useState, type ReactElement, type ReactNode } from 'react'

import { Highlight } from '@/ds/Highlight'
import { Icon } from '@/ds/Icon'
import { PickerEmpty, PickerOption, PickerPopover } from '@/ds/Picker'
import { displayName } from '@/domain/person'
import { matchingPeople, matchScore, suggestionOrder } from '@/ui/boards/people'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import { usePeople } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'
import { useSession } from '@/ui/session/SessionGate'

export const anyOf = (lang: string, values: string[]) =>
  new Intl.ListFormat(lang, { type: 'disjunction' }).format(values)

export function useAssigneeName(): (value: string) => string {
  const { t } = useI18n()
  const people = usePeople()
  return value => {
    if (value === 'me' || value === 'nobody') {
      return t(`filters.assignees.${value}`)
    }
    if (people.isPending) return '…'
    const person = people.data?.find(each => each.userId === value)
    return person ? displayName(person) : t('filters.assignees.someone')
  }
}

const noOne = (
  <Avatar size={24}>
    <Icon icon={People} size={14} />
  </Avatar>
)

// Picking nothing matches anyone.
export function AssigneeField({
  value,
  onChange
}: {
  value: string[]
  onChange: (value: string[]) => void
}): ReactElement {
  const { t, lang } = useI18n()
  const { user } = useSession()
  const people = usePeople()
  const nameOf = useAssigneeName()
  const field = useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [search, setSearch] = useState('')
  const [pinned] = useState(() => new Set(value))

  const query = search.trim()
  const known = people.data ?? []
  // Me is also found by the person's own name and email.
  const choices: {
    value: string
    start: ReactNode
    email?: string
    alias?: string
  }[] = [
    {
      value: 'me',
      start: <PersonAvatar email={user.email ?? ''} name={user.name} />,
      alias: `${user.name ?? ''} ${user.email ?? ''}`
    },
    { value: 'nobody', start: noOne },
    ...(!people.isPending && !query
      ? value
          .filter(
            each =>
              each !== 'me' &&
              each !== 'nobody' &&
              !known.some(person => person.userId === each)
          )
          .map(each => ({ value: each, start: noOne }))
      : [])
  ]
  const fixed = choices.filter(
    // Only a word start: "bo" is Bob, not Nobody.
    option =>
      !query ||
      matchScore(
        {
          userId: option.value,
          name: `${nameOf(option.value)} ${option.alias ?? ''}`,
          email: ''
        },
        query
      ) === 3
  )
  const shown = [
    ...fixed,
    ...matchingPeople(suggestionOrder(known, pinned, null, []), query).map(
      person => ({
        value: person.userId,
        email: person.email,
        start: (
          <PersonAvatar
            email={person.email}
            name={person.name}
            avatar={person.avatar}
          />
        )
      })
    )
  ]

  const toggle = (each: string) => {
    onChange(
      value.includes(each)
        ? value.filter(other => other !== each)
        : [...value, each]
    )
  }

  // The field looks like the other criteria, but opens the people picker
  // instead of its own menu.
  return (
    <>
      <TextField
        ref={field}
        select
        label={t('filters.assignee')}
        value={value}
        slotProps={{
          inputLabel: { shrink: true },
          select: {
            multiple: true,
            displayEmpty: true,
            open: false,
            onOpen: () => {
              setAnchor(field.current)
            },
            renderValue: () =>
              value.length > 0
                ? anyOf(lang, value.map(nameOf))
                : t('filters.assignees.any'),
            SelectDisplayProps: {
              'aria-haspopup': 'dialog',
              'aria-expanded': anchor !== null
            }
          }
        }}
      >
        {[]}
      </TextField>
      <PickerPopover
        label={t('filters.assignee')}
        anchor={anchor}
        onClose={() => {
          setAnchor(null)
          setSearch('')
        }}
        searchLabel={t('board.searchPeople')}
        countLabel={count => t('picker.count', { smart_count: count })}
        search={search}
        onSearch={setSearch}
        onPickFirst={() => {
          if (shown[0]) toggle(shown[0].value)
        }}
      >
        {shown.map(option => (
          <PickerOption
            key={option.value}
            checked={value.includes(option.value)}
            onToggle={() => {
              toggle(option.value)
            }}
            start={option.start}
          >
            <Typography variant="body2" className="u-ellipsis">
              <Highlight text={nameOf(option.value)} query={query} />
            </Typography>
            {option.email && nameOf(option.value) !== option.email && (
              <Typography
                variant="caption"
                color="textSecondary"
                component="div"
                className="u-ellipsis"
              >
                <Highlight text={option.email} query={query} />
              </Typography>
            )}
          </PickerOption>
        ))}
        {shown.length === 0 && (
          <PickerEmpty>
            {t('board.noPeopleMatch', { search: query })}
          </PickerEmpty>
        )}
      </PickerPopover>
    </>
  )
}
