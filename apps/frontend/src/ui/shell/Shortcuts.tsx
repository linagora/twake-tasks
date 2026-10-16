import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography
} from '@linagora/twake-mui'
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  type ReactElement
} from 'react'
import { useNavigate } from 'react-router'

import { anyTaskOpen, TASK_KEYS, typing } from '@/ui/boards/taskShortcuts'
import { useI18n } from '@/ui/i18n/useI18n'

const GO = {
  b: { path: '/', label: 'boards.title' },
  t: { path: '/today', label: 'agenda.today' },
  u: { path: '/upcoming', label: 'agenda.upcoming' },
  m: { path: '/mine', label: 'agenda.mine' },
  f: { path: '/filters', label: 'filters.title' }
} as const

// The tasks of the page, in reading order, for j and k to walk through.
function stepTask(delta: 1 | -1): boolean {
  if (anyTaskOpen()) return false
  const openers = [
    ...document.querySelectorAll<HTMLElement>('[data-task-opener]')
  ].filter(
    each => each.getClientRects().length > 0 || !each.closest('[hidden]')
  )
  if (openers.length === 0) return false
  const at = openers.indexOf(document.activeElement as HTMLElement)
  const next =
    at < 0 ? openers[delta > 0 ? 0 : openers.length - 1] : openers[at + delta]
  if (!next) return true
  next.focus()
  // Not every browser engine scrolls an element into view (jsdom).
  ;(next as Partial<HTMLElement>).scrollIntoView?.({
    block: 'nearest',
    inline: 'nearest'
  })
  return true
}

const onOpener = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && target.hasAttribute('data-task-opener')

export function useShortcuts(actions: {
  quickAdd: () => void
  search: () => void
  help: () => void
}): void {
  const navigate = useNavigate()
  const going = useRef(false)

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (typing(event.target)) return
    if (going.current) {
      going.current = false
      if (event.key in GO) {
        event.preventDefault()
        void navigate(GO[event.key as keyof typeof GO].path)
      }
      return
    }
    // The arrows walk tasks only from a task, not to scroll the page.
    if (
      (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
      onOpener(event.target)
    ) {
      if (stepTask(event.key === 'ArrowDown' ? 1 : -1)) event.preventDefault()
      return
    }
    if (event.key === 'j' || event.key === 'k') {
      if (stepTask(event.key === 'j' ? 1 : -1)) event.preventDefault()
      return
    }
    const action = {
      g: () => {
        going.current = true
      },
      q: actions.quickAdd,
      '/': actions.search,
      '?': actions.help
    }[event.key]
    if (!action) return
    event.preventDefault()
    action()
  })

  useEffect(() => {
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [])
}

export function ShortcutsHelp({
  onClose
}: {
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const sections: { title: string; rows: [string, string][] }[] = [
    {
      title: t('shortcuts.go'),
      rows: [
        ...Object.entries(GO).map(([key, { label }]): [string, string] => [
          t('shortcuts.then', { key }),
          t(label)
        ]),
        ['/', t('search.label')],
        ['q', t('quickAdd.title')]
      ]
    },
    {
      title: t('shortcuts.inList'),
      rows: [
        ['j  ↓', t('shortcuts.next')],
        ['k  ↑', t('shortcuts.previous')],
        ['Enter', t('shortcuts.open')]
      ]
    },
    {
      title: t('shortcuts.inTask'),
      rows: [
        ...Object.entries(TASK_KEYS).map(([key, action]): [string, string] => [
          key,
          t(`shortcuts.${action}`)
        ]),
        ['Esc', t('shortcuts.closeTask')]
      ]
    },
    { title: t('shortcuts.title'), rows: [['?', t('shortcuts.title')]] }
  ]
  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId}>
      <DialogTitle id={titleId}>{t('shortcuts.title')}</DialogTitle>
      <DialogContent>
        {sections.map(section => (
          <section key={section.title} aria-label={section.title}>
            <Typography
              variant="subtitle2"
              component="h3"
              className="u-mt-1 u-mb-half"
            >
              {section.title}
            </Typography>
            <dl className="u-m-0">
              {section.rows.map(([keys, label]) => (
                <div key={keys} className="u-flex u-mb-half">
                  <Typography component="dt" className="u-w-4 u-mr-1">
                    <kbd>{keys}</kbd>
                  </Typography>
                  <Typography component="dd" className="u-m-0">
                    {label}
                  </Typography>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </DialogContent>
      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {t('shortcuts.close')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
