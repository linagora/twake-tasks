import { useColorScheme } from '@linagora/twake-mui'
import { useQuery } from '@tanstack/react-query'
import { useEffect, type ReactElement, type ReactNode } from 'react'

import { PickersProvider } from '@/ds/Pickers'
import { useBoardsApi } from '@/ui/boards/BoardsApiProvider'
import { followZone } from '@/ui/boards/dueLabel'
import { I18nProvider } from '@/ui/i18n/I18nProvider'
import { resolveLanguage } from '@/ui/i18n/languages'
import { useI18n } from '@/ui/i18n/useI18n'

/**
 * Shows the app in the person's Twake Workplace language, theme and timezone,
 * falling back to the browser's for any they never chose.
 */
export function FollowSettings({
  children
}: {
  children: ReactNode
}): ReactElement | null {
  const api = useBoardsApi()
  const { lang: browserLang } = useI18n()
  const { setMode } = useColorScheme()
  const { data, isPending } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings,
    retry: false,
    staleTime: Infinity
  })

  const theme = data?.theme
  useEffect(() => {
    if (theme) setMode(theme === 'auto' ? 'system' : theme)
  }, [theme, setMode])

  if (isPending) return null
  followZone(data?.timezone ?? null)
  const lang = resolveLanguage([data?.language, browserLang])
  return (
    <I18nProvider lang={lang}>
      <PickersProvider lang={lang}>{children}</PickersProvider>
    </I18nProvider>
  )
}
