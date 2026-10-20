import type { ReactElement } from 'react'

import { ReactionBar } from '@/ds/ReactionBar'
import { ReactionPicker } from '@/ds/ReactionPicker'
import type { Reaction } from '@/application/boards'
import type { Person } from '@/domain/board'
import { displayName } from '@/domain/person'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import type { EmojiInput } from '@/ui/boards/useEmojiInput'
import { useI18n } from '@/ui/i18n/useI18n'

type OnReact = (emoji: string, on: boolean) => void

const isSamePerson = (a: Person, b: Person): boolean =>
  a.email.toLowerCase() === b.email.toLowerCase()

/** The reactions under a comment. */
export function CommentReactions({
  reactions,
  me,
  readOnly,
  onReact
}: {
  reactions: Reaction[]
  me: Person
  readOnly: boolean
  onReact: OnReact
}): ReactElement | null {
  const { t } = useI18n()
  return (
    <ReactionBar
      reactions={reactions.map(reaction => {
        const people = reaction.people.map(displayName).join(', ')
        return {
          emoji: reaction.emoji,
          count: reaction.people.length,
          mine: reaction.people.some(person => isSamePerson(person, me)),
          people,
          who: reaction.people.map(person => ({
            key: person.email,
            name: displayName(person),
            avatar: (
              <PersonAvatar
                email={person.email}
                name={person.name}
                avatar={person.avatar}
                size={24}
              />
            )
          })),
          label: t('task.reaction', { emoji: reaction.emoji, names: people })
        }
      })}
      labels={{
        group: t('task.reactions'),
        who: t('task.whoReacted'),
        hidden: count => t('task.moreReactions', { count })
      }}
      readOnly={readOnly}
      onReact={onReact}
    />
  )
}

/** The button that appears over a comment to react to it. */
export function ReactButton({
  reactions,
  me,
  emojiInput,
  onReact
}: {
  reactions: Reaction[]
  me: Person
  emojiInput: EmojiInput
  onReact: OnReact
}): ReactElement {
  const { t } = useI18n()
  const mine = new Set(
    reactions
      .filter(reaction =>
        reaction.people.some(person => isSamePerson(person, me))
      )
      .map(reaction => reaction.emoji)
  )
  return (
    <ReactionPicker
      quick={emojiInput.quick}
      mine={mine}
      labels={{
        open: t('task.addReaction'),
        quick: t('task.quickReactions'),
        more: t('task.moreEmoji')
      }}
      picker={emojiInput.emoji}
      onReact={onReact}
    />
  )
}
