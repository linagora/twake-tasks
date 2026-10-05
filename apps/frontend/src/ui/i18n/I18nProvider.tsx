import { useEffect, type ReactElement, type ReactNode } from 'react'
import { I18n } from 'twake-i18n'

import de from '@/locales/de.json'
import en from '@/locales/en.json'
import es from '@/locales/es.json'
import fr from '@/locales/fr.json'
import it from '@/locales/it.json'
import ru from '@/locales/ru.json'
import vi from '@/locales/vi.json'
import { DEFAULT_LANGUAGE, type SupportedLanguage } from '@/ui/i18n/languages'

const DICTIONARIES: Record<SupportedLanguage, typeof en> = {
  en,
  fr,
  de,
  es,
  it,
  ru,
  vi
}

function dictionary(lang: SupportedLanguage): typeof en {
  return DICTIONARIES[lang]
}

export interface I18nProviderProps {
  lang: SupportedLanguage
  children: ReactNode
}

export function I18nProvider({
  lang,
  children
}: I18nProviderProps): ReactElement {
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  return (
    <I18n
      lang={lang}
      defaultLang={DEFAULT_LANGUAGE}
      dictRequire={dictionary}
      polyglot={null}
      context={null}
    >
      {children}
    </I18n>
  )
}
