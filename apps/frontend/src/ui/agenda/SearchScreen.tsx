import { Magnifier, Mosaic } from '@linagora/twake-icons'
import { Button, Link, Typography } from '@linagora/twake-mui'
import {
  useEffect,
  useId,
  useState,
  type ReactElement,
  type RefObject
} from 'react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router'

import type { BoardSummary } from '@/domain/board'
import { listBoards } from '@/domain/boardList'
import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import { fold, Highlight } from '@/ds/Highlight'
import { Icon } from '@/ds/Icon'
import { ResultMenu, type ResultItem } from '@/ds/ResultMenu'
import { TaskIcon } from '@/ds/TaskIcon'
import { SearchBar } from '@/ds/SearchBar'
import { TaskGroup, TaskRow } from '@/ds/TaskList'
import { BoardChip } from '@/ds/TileGrid'
import { Group } from '@/ui/agenda/AgendaScreen'
import { useBoardName, useProjectName } from '@/ui/boards/BoardsScreen'
import { useBoards } from '@/ui/queries/boards'
import { searchMinLength, useSearch } from '@/ui/queries/search'
import { OriginContext, PageCrumbs } from '@/ui/boards/Crumbs'
import { useI18n } from '@/ui/i18n/useI18n'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

// As Twake Drive's search: the results follow the typing once it pauses.
const RESULTS_DELAY = 250

function useDelayed(value: string, delay: number): string {
  const [delayed, setDelayed] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDelayed(value)
    }, delay)
    return () => {
      window.clearTimeout(timer)
    }
  }, [value, delay])
  return delayed
}

/** The boards, then the tasks, that `query` finds, for the list under the field. */
function useLiveResults(query: string): {
  items: ResultItem[]
  loading: boolean
  message: string | null
} {
  const { t } = useI18n()
  const boards = useBoards()
  const projectName = useProjectName()
  const tasks = useSearch(query)
  const minLength = searchMinLength()
  if (query.length < minLength) {
    return {
      items: [],
      loading: false,
      message: t('search.tooShort', { count: minLength })
    }
  }
  const folded = fold(query)
  const found = listBoards(
    (boards.data ?? []).filter(
      board =>
        !board.archived &&
        (fold(board.name).includes(folded) ||
          fold(board.keyPrefix).startsWith(folded))
    )
  )
  const items: ResultItem[] = [
    ...found.map(board => ({
      id: `board-${board.id}`,
      to: `/boards/${board.id}`,
      // The icon of each board in the navigation.
      icon: <Icon icon={Mosaic} size={24} color="currentColor" />,
      primary: <Highlight text={board.name} query={query} tone="primary" />,
      secondary: projectName(board.project)
    })),
    ...(tasks.data ?? []).map(task => ({
      id: task.id,
      to: `/boards/${task.boardId}?${new URLSearchParams({ task: task.key }).toString()}`,
      // The app's icon, outlined, in the colour of text.
      icon: <Icon icon={TaskIcon} size={24} color="currentColor" />,
      primary: <Highlight text={task.title} query={query} tone="primary" />,
      secondary: `${task.key} · ${task.boardName}`
    }))
  ]
  return {
    items,
    loading: tasks.isPending,
    message: tasks.isError ? t('search.failed') : t('search.noResults')
  }
}

export function SearchField({
  inputRef,
  className,
  size = 'medium'
}: {
  inputRef: RefObject<HTMLInputElement | null>
  className?: string
  size?: 'small' | 'medium'
}): ReactElement {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const searched = params.get('q')?.trim() ?? ''
  const [text, setText] = useState(searched)
  const [shown, setShown] = useState(searched)
  if (searched !== shown) {
    setShown(searched)
    setText(searched)
  }
  const [field, setField] = useState<HTMLDivElement | null>(null)
  const [focused, setFocused] = useState(false)
  const [selected, setSelected] = useState(0)
  const listId = useId()
  const query = useDelayed(text.trim(), RESULTS_DELAY)
  const results = useLiveResults(query)
  const open = focused && query !== '' && text.trim() !== ''
  const { items } = results
  const current = open ? items[selected] : undefined

  // Once a result is chosen, the field empties, as Twake Drive's.
  const clear = () => {
    setText('')
    setSelected(0)
  }

  return (
    <>
      <SearchBar
        ref={setField}
        role="search"
        size={size}
        className={[className, open && 'SearchBar-open']
          .filter(Boolean)
          .join(' ')}
        // As Twake Drive's search: flat, without a clear button, outlined
        // while empty only.
        elevation={0}
        disabledClear
        disabledFocus={text !== ''}
        placeholder={t('search.label')}
        value={text}
        onChange={event => {
          setText(event.target.value)
          setSelected(0)
        }}
        onFocus={() => {
          setFocused(true)
        }}
        onBlur={() => {
          setFocused(false)
        }}
        onSubmit={event => {
          event.preventDefault()
          if (!text.trim()) return
          void navigate(
            `/search?${new URLSearchParams({ q: text.trim() }).toString()}`
          )
        }}
        componentsProps={{
          inputBase: {
            inputRef,
            inputProps: {
              type: 'search',
              maxLength: 200,
              role: 'combobox',
              'aria-autocomplete': 'list',
              'aria-expanded': open,
              'aria-controls': open ? listId : undefined,
              'aria-activedescendant': current
                ? `${listId}-${String(selected)}`
                : undefined
            },
            onKeyDown: event => {
              if (event.key === 'Escape' && text !== '') {
                event.preventDefault()
                clear()
              } else if (open && items.length > 0) {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setSelected((selected + 1) % items.length)
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setSelected((selected - 1 + items.length) % items.length)
                } else if (event.key === 'Enter' && current) {
                  event.preventDefault()
                  clear()
                  void navigate(current.to)
                }
              }
            }
          }
        }}
      />
      {open && (
        <ResultMenu
          anchor={field}
          id={listId}
          items={items}
          selected={selected}
          loading={results.loading}
          message={results.message}
          link={RouterLink}
          onChoose={clear}
        />
      )}
    </>
  )
}

const SHOWN_BOARDS = 5

function BoardResults({
  text,
  found
}: {
  text: string
  found: BoardSummary[]
}): ReactElement | null {
  const { t } = useI18n()
  const projectName = useProjectName()
  const [expanded, setExpanded] = useState(false)
  if (found.length === 0) return null
  const shown = expanded ? found : found.slice(0, SHOWN_BOARDS)
  return (
    <>
      <TaskGroup label={t('boards.title')} count={found.length}>
        {shown.map(board => (
          <TaskRow
            key={board.id}
            label={board.name}
            leading={(Array.from(board.name)[0] ?? '').toUpperCase()}
            title={
              <Link component={RouterLink} to={`/boards/${board.id}`}>
                <Highlight text={board.name} query={text} />
              </Link>
            }
            context={projectName(board.project)}
            facts={
              <>
                <BoardChip label={board.keyPrefix} />
                {board.project.managed && (
                  <BoardChip
                    label={t('boards.spaceChip')}
                    hint={t('boards.spaceHint', { name: board.project.name })}
                  />
                )}
              </>
            }
          />
        ))}
      </TaskGroup>
      {shown.length < found.length && (
        <Button
          variant="text"
          className="u-mb-1"
          onClick={() => {
            setExpanded(true)
          }}
        >
          {t('search.allBoards', { smart_count: found.length })}
        </Button>
      )}
    </>
  )
}

export function SearchScreen(): ReactElement {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const text = params.get('q')?.trim() ?? ''
  const results = useSearch(text)
  const boards = useBoards()
  const boardName = useBoardName()
  const minLength = searchMinLength()
  useDocumentTitle(t('search.label'))

  const query = fold(text)
  const foundBoards =
    text.length >= minLength
      ? listBoards(
          (boards.data ?? [])
            .map(board => ({ ...board, name: boardName(board) }))
            .filter(
              board =>
                !board.archived &&
                (fold(board.name).includes(query) ||
                  fold(board.keyPrefix).startsWith(query))
            )
        )
      : []
  const found =
    results.data && !boards.isPending
      ? [
          results.data.length > 0 &&
            t('search.found', { smart_count: results.data.length, text }),
          foundBoards.length > 0 &&
            t('search.boardsFound', { smart_count: foundBoards.length })
        ]
          .filter(Boolean)
          .join('. ')
      : ''

  const origin = {
    icon: Magnifier,
    label: t('search.label'),
    to: text ? `/search?q=${encodeURIComponent(text)}` : '/search'
  }

  return (
    <OriginContext value={origin}>
      <main className="u-ph-2 u-pt-half u-pb-2">
        <PageCrumbs origin={origin} heading />
        {results.isError && (
          <Typography role="alert">{t('search.failed')}</Typography>
        )}
        {text !== '' && text.length < minLength && (
          <Typography>{t('search.tooShort', { count: minLength })}</Typography>
        )}
        <p role="status" className="u-visuallyhidden">
          {found}
        </p>
        {text.length >= minLength && (
          <BoardResults key={text} text={text} found={foundBoards} />
        )}
        {text.length >= minLength && results.isPending && (
          <ListSkeleton label={t('app.loading')} />
        )}
        {results.data?.length === 0 && (
          <EmptyState
            icon={Magnifier}
            title={t('search.empty')}
            text={t('search.emptyHint')}
          />
        )}
        {results.data && results.data.length > 0 && (
          <Group
            label={t('search.results', { text })}
            tasks={results.data}
            highlight={text}
          />
        )}
      </main>
    </OriginContext>
  )
}
