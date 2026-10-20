import { Magnifier } from '@linagora/twake-icons'
import { Typography } from '@linagora/twake-mui'
import { useState, type ReactElement, type RefObject } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import { SearchBar } from '@/ds/SearchBar'
import { Group } from '@/ui/agenda/AgendaScreen'
import { useSearch } from '@/ui/boards/queries'
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

export function SearchScreen(): ReactElement {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const text = params.get('q')?.trim() ?? ''
  const results = useSearch(text)
  useDocumentTitle(t('search.label'))

  const origin = {
    icon: Magnifier,
    label: t('search.label'),
    to: text ? `/search?q=${encodeURIComponent(text)}` : '/search'
  }

  return (
    <OriginContext value={origin}>
      <main className="u-ph-2 u-pt-half u-pb-2">
        <PageCrumbs origin={origin} />
        <Typography variant="h3" component="h1" className="u-mb-2">
          {t('search.label')}
        </Typography>
        {results.isError && (
          <Typography role="alert">{t('search.failed')}</Typography>
        )}
        {text !== '' && results.isPending && (
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
