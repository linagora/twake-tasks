import {
  CalendarToday,
  Clock,
  ClockOutline,
  Folder,
  Hourglass,
  Icon,
  InfoOutlined,
  Mosaic,
  Profile,
  Sync
} from '@linagora/twake-icons'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  TextField,
  Typography
} from '@linagora/twake-mui'
import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement
} from 'react'

import { isPerson, nameHas, QuickAddError, same } from '@/application/quickAdd'
import { LabelChip, MetaChip } from '@/ds/Columns'
import {
  ParsedPart,
  ParsedParts,
  ParsedTitle,
  SuggestionList,
  SuggestionOption,
  SyntaxHelp
} from '@/ds/QuickEntry'
import type { Board, BoardSummary } from '@/domain/board'
import { displayName } from '@/domain/person'
import {
  mentionAt,
  parseQuickAdd,
  pickMention,
  type Mention,
  type QuickTask
} from '@/domain/quickAdd'
import { formatDay, localToday, shortDay } from '@/ui/boards/dueLabel'
import { useQuickAdd, useQuickAddBoard } from '@/ui/boards/queries'
import { PriorityChip } from '@/ui/boards/TaskFacts'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'

interface Suggestion {
  key: string
  /** What picking it types after the sigil. */
  name: string
  label?: string
  hint?: string
}

const SYNTAX = ['dates', 'repeat', 'priority', 'names', 'more'] as const

function suggest(
  mention: Mention,
  boards: BoardSummary[],
  board: Board | undefined
): Suggestion[] {
  const all: Suggestion[] =
    mention.sigil === '#'
      ? boards.map(each => ({
          key: each.id,
          name: each.name,
          hint: each.keyPrefix
        }))
      : mention.sigil === '/'
        ? (board?.sections ?? []).map(each => ({
            key: each.id,
            name: each.name
          }))
        : mention.sigil === '%'
          ? (board?.labels ?? []).map(each => ({
              key: each.id,
              name: each.name
            }))
          : (board?.members ?? []).map(each => ({
              key: each.userId,
              name: each.email.split('@')[0] ?? each.email,
              label: displayName(each),
              hint: each.email
            }))
  return all
    .filter(each =>
      [each.name, each.label, each.hint].some(
        text => text !== undefined && nameHas(text, mention.typed)
      )
    )
    .slice(0, 6)
}

function Understood({
  parsed,
  summary,
  board,
  boardsLoaded
}: {
  parsed: QuickTask
  summary: BoardSummary | undefined
  board: Board | undefined
  boardsLoaded: boolean
}): ReactElement {
  const { t, lang } = useI18n()
  const { recurrence, duration } = parsed
  const { section: typedSection } = parsed
  const section =
    typedSection === undefined
      ? undefined
      : board?.sections.find(each => same(typedSection, each.name))
  const memberOf = (typed: string) =>
    board?.members.find(each => isPerson(typed, each.email))

  return (
    <ParsedParts label={t('quickAdd.understood')}>
      {parsed.title && (
        <ParsedPart>
          <ParsedTitle>{parsed.title}</ParsedTitle>
        </ParsedPart>
      )}
      {parsed.dueDate && (
        <ParsedPart>
          <MetaChip
            icon={<Icon icon={CalendarToday} />}
            tone="info"
            label={t('board.due', { date: formatDay(parsed.dueDate, lang) })}
          >
            {shortDay(parsed.dueDate, lang)}
          </MetaChip>
        </ParsedPart>
      )}
      {parsed.dueTime && (
        <ParsedPart>
          <MetaChip
            icon={<Icon icon={Clock} />}
            tone="info"
            label={t('quickAdd.at', { time: parsed.dueTime })}
          >
            {parsed.dueTime}
          </MetaChip>
        </ParsedPart>
      )}
      {recurrence && (
        <ParsedPart>
          <MetaChip
            icon={<Icon icon={Sync} />}
            tone="info"
            label={t(
              recurrence.fromCompletion
                ? `dates.every.${recurrence.unit}AfterCompletion`
                : `dates.every.${recurrence.unit}`,
              { smart_count: recurrence.every }
            )}
          >
            {t(`dates.every.${recurrence.unit}`, {
              smart_count: recurrence.every
            })}
          </MetaChip>
        </ParsedPart>
      )}
      {parsed.deadline && (
        <ParsedPart>
          <MetaChip
            icon={<Icon icon={Hourglass} />}
            tone="info"
            label={t('dates.deadlineOn', {
              date: formatDay(parsed.deadline, lang)
            })}
          >
            {shortDay(parsed.deadline, lang)}
          </MetaChip>
        </ParsedPart>
      )}
      {duration && (
        <ParsedPart>
          <MetaChip
            icon={<Icon icon={ClockOutline} />}
            tone="info"
            label={t(
              duration.unit === 'minutes' ? 'dates.minutes' : 'dates.days',
              { amount: duration.amount }
            )}
          >
            {t(duration.unit === 'minutes' ? 'dates.minutes' : 'dates.days', {
              amount: duration.amount
            })}
          </MetaChip>
        </ParsedPart>
      )}
      {parsed.priority && (
        <ParsedPart>
          <PriorityChip priority={parsed.priority} />
        </ParsedPart>
      )}
      {parsed.board !== undefined && (
        <ParsedPart>
          <MetaChip
            icon={<Icon icon={Mosaic} />}
            tone={summary || !boardsLoaded ? 'info' : 'warning'}
            label={t('quickAdd.board', {
              name: summary?.name ?? parsed.board
            })}
          >
            {summary?.name ?? parsed.board}
          </MetaChip>
        </ParsedPart>
      )}
      {parsed.section !== undefined && (
        <ParsedPart>
          <MetaChip
            icon={<Icon icon={Folder} />}
            tone={section || !board ? 'info' : 'warning'}
            label={t('quickAdd.section', {
              name: section?.name ?? parsed.section
            })}
          >
            {section?.name ?? parsed.section}
          </MetaChip>
        </ParsedPart>
      )}
      {parsed.labels.map(name => (
        <ParsedPart key={`%${name}`}>
          <LabelChip name={name} />
        </ParsedPart>
      ))}
      {parsed.people.map(typed => {
        const member = memberOf(typed)
        const name = member ? displayName(member) : typed
        return (
          <ParsedPart key={`+${typed}`}>
            <MetaChip
              icon={<Icon icon={Profile} />}
              tone={member || !board ? 'info' : 'warning'}
              label={t('quickAdd.person', { name })}
            >
              {name}
            </MetaChip>
          </ParsedPart>
        )
      })}
    </ParsedParts>
  )
}

export function QuickAdd({ onClose }: { onClose: () => void }): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const listId = useId()
  const helpId = useId()
  const [line, setLine] = useState('')
  const [caret, setCaret] = useState(0)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [helping, setHelping] = useState(false)
  const input = useRef<HTMLInputElement | null>(null)
  const nextCaret = useRef<number | null>(null)
  const add = useQuickAdd()

  const parsed = parseQuickAdd(line, localToday())
  const { boards, summary, board } = useQuickAddBoard(parsed.board)
  const mention = dismissed ? null : mentionAt(line, caret)
  const suggestions = mention ? suggest(mention, boards ?? [], board) : []
  const open = suggestions.length > 0
  const selected = Math.min(active, suggestions.length - 1)

  const inputRef = useCallback((element: HTMLInputElement | null) => {
    input.current = element
    focusOnMount(element)
  }, [])

  useLayoutEffect(() => {
    if (nextCaret.current === null) return
    input.current?.setSelectionRange(nextCaret.current, nextCaret.current)
    nextCaret.current = null
  }, [line])

  const type = (value: string, at: number) => {
    setLine(value)
    setCaret(at)
    setActive(0)
    setDismissed(false)
  }

  const pick = (suggestion: Suggestion) => {
    if (!mention) return
    const picked = pickMention(line, mention, suggestion.name)
    nextCaret.current = picked.caret
    type(picked.line, picked.caret)
  }

  const error = add.error
  const refusal =
    error instanceof QuickAddError
      ? t(`quickAdd.${error.code}`, { name: error.typed ?? '' })
      : t('quickAdd.failed')

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="medium">
      <form
        onSubmit={event => {
          event.preventDefault()
          add.mutate(line, {
            onSuccess: () => {
              type('', 0)
            }
          })
        }}
      >
        <DialogTitle id={titleId}>{t('quickAdd.title')}</DialogTitle>
        <DialogContent>
          <TextField
            label={t('quickAdd.task')}
            value={line}
            onChange={event => {
              type(
                event.target.value,
                event.target.selectionStart ?? event.target.value.length
              )
            }}
            onSelect={event => {
              const target = event.target as HTMLInputElement
              setCaret(target.selectionStart ?? line.length)
            }}
            onKeyDown={event => {
              if (!open) return
              const pressed = event.key
              if (pressed === 'ArrowDown' || pressed === 'ArrowUp') {
                event.preventDefault()
                const step = pressed === 'ArrowDown' ? 1 : -1
                setActive(
                  (selected + step + suggestions.length) % suggestions.length
                )
              } else if (pressed === 'Enter' || pressed === 'Tab') {
                const suggestion = suggestions[selected]
                if (!suggestion) return
                event.preventDefault()
                pick(suggestion)
              } else if (pressed === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                setDismissed(true)
              }
            }}
            fullWidth
            margin="dense"
            inputRef={inputRef}
            slotProps={{
              htmlInput: {
                maxLength: 1000,
                role: 'combobox',
                autoComplete: 'off',
                'aria-autocomplete': 'list',
                'aria-expanded': open,
                'aria-controls': open ? listId : undefined,
                'aria-activedescendant': open
                  ? `${listId}-${String(selected)}`
                  : undefined
              },
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      edge="end"
                      size="small"
                      aria-label={t('quickAdd.syntaxHelp')}
                      aria-expanded={helping}
                      aria-controls={helpId}
                      onClick={() => {
                        setHelping(!helping)
                      }}
                    >
                      <Icon icon={InfoOutlined} />
                    </IconButton>
                  </InputAdornment>
                )
              }
            }}
          />
          {open && (
            <SuggestionList id={listId} label={t('quickAdd.suggestions')}>
              {suggestions.map((suggestion, index) => (
                <SuggestionOption
                  key={suggestion.key}
                  id={`${listId}-${String(index)}`}
                  selected={index === selected}
                  onPick={() => {
                    pick(suggestion)
                  }}
                  primary={suggestion.label ?? suggestion.name}
                  secondary={suggestion.hint}
                  // Names are typed with dashes for spaces.
                  highlight={mention?.typed.replaceAll('-', ' ') ?? ''}
                />
              ))}
            </SuggestionList>
          )}
          {line.trim() && (
            <Understood
              parsed={parsed}
              summary={summary}
              board={board}
              boardsLoaded={boards !== undefined}
            />
          )}
          {helping && (
            <SyntaxHelp
              id={helpId}
              lines={SYNTAX.map(part => t(`quickAdd.syntax.${part}`))}
            />
          )}
          {add.isSuccess && (
            <Typography role="status">
              {t('quickAdd.added', { key: add.data.key })}
            </Typography>
          )}
          {add.isError && <Typography role="alert">{refusal}</Typography>}
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={onClose}>
            {t('quickAdd.close')}
          </Button>
          <Button type="submit" disabled={add.isPending || !line.trim()}>
            {t('quickAdd.add')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
