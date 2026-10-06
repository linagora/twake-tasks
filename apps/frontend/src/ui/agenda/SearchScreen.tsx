import { TextField, Typography } from '@linagora/twake-mui'
import { useState, type ReactElement, type RefObject } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { Group } from '@/ui/agenda/AgendaScreen'
import { useSearch } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

export function SearchField({
  inputRef
}: {
  inputRef: RefObject<HTMLInputElement | null>
}): ReactElement {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  return (
    <form
      role="search"
      className="u-ml-auto u-w-100-m u-mv-half"
      onSubmit={event => {
        event.preventDefault()
        if (!text.trim()) return
        void navigate(
          `/search?${new URLSearchParams({ q: text.trim() }).toString()}`
        )
      }}
    >
      <TextField
        label={t('search.label')}
        type="search"
        size="small"
        fullWidth
        value={text}
        onChange={event => {
          setText(event.target.value)
        }}
        inputRef={inputRef}
        slotProps={{ htmlInput: { maxLength: 200 } }}
      />
    </form>
  )
}

export function SearchScreen(): ReactElement {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const text = params.get('q')?.trim() ?? ''
  const results = useSearch(text)
  useDocumentTitle(t('search.label'))

  return (
    <main className="u-p-2">
      {results.isError && (
        <Typography role="alert">{t('search.failed')}</Typography>
      )}
      {results.data?.length === 0 && (
        <Typography>{t('search.empty')}</Typography>
      )}
      {results.data && results.data.length > 0 && (
        <Group label={t('search.results', { text })} tasks={results.data} />
      )}
    </main>
  )
}
