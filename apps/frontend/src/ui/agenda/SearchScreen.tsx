import { Magnifier } from '@linagora/twake-icons'
import { Button, Link, Typography } from '@linagora/twake-mui'
import { useState, type ReactElement, type RefObject } from 'react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router'

import { listBoards } from '@/domain/boardList'
import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import { fold, Highlight } from '@/ds/Highlight'
import { SearchBar } from '@/ds/SearchBar'
import { TaskGroup, TaskRow } from '@/ds/TaskList'
import { BoardChip } from '@/ds/TileGrid'
import { Group } from '@/ui/agenda/AgendaScreen'
import { useProjectName } from '@/ui/boards/BoardsScreen'
import { searchMinLength, useBoards, useSearch } from '@/ui/boards/queries'
import { OriginContext, PageCrumbs } from '@/ui/boards/Crumbs'
import { useI18n } from '@/ui/i18n/useI18n'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

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
  return (
    <SearchBar
      role="search"
      size={size}
      className={className}
      placeholder={t('search.label')}
      value={text}
      onChange={event => {
        setText(event.target.value)
      }}
      onSubmit={event => {
        event.preventDefault()
        if (!text.trim()) return
        void navigate(
          `/search?${new URLSearchParams({ q: text.trim() }).toString()}`
        )
      }}
      componentsProps={{
        inputBase: { inputRef, inputProps: { type: 'search', maxLength: 200 } }
      }}
    />
  )
}

const SHOWN_BOARDS = 5

function BoardResults({ text }: { text: string }): ReactElement | null {
  const { t } = useI18n()
  const boards = useBoards()
  const projectName = useProjectName()
  const [expanded, setExpanded] = useState(false)
  const query = fold(text)
  const found = listBoards(
    (boards.data ?? []).filter(
      board =>
        !board.archived &&
        (fold(board.name).includes(query) ||
          fold(board.keyPrefix).startsWith(query))
    )
  )
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
  const minLength = searchMinLength()
  useDocumentTitle(t('search.label'))

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
        {text.length >= minLength && <BoardResults key={text} text={text} />}
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
