import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormHelperText,
  Switch,
  Typography
} from '@linagora/twake-mui'
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type ReactElement
} from 'react'
import { useNavigate } from 'react-router'

import { useI18n } from '@/ui/i18n/useI18n'

const GO = {
  b: { path: '/', label: 'boards.title' },
  t: { path: '/today', label: 'agenda.today' },
  u: { path: '/upcoming', label: 'agenda.upcoming' },
  m: { path: '/mine', label: 'agenda.mine' },
  f: { path: '/filters', label: 'filters.title' }
} as const

const KEY = 'twake-tasks:shortcuts'

function shortcutsOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

export function useShortcuts(actions: {
  newTask: () => void
  search: () => void
  help: () => void
}): void {
  const navigate = useNavigate()
  const going = useRef(false)

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (typing(event.target) || !shortcutsOn()) return
    if (going.current) {
      going.current = false
      if (event.key in GO) {
        event.preventDefault()
        void navigate(GO[event.key as keyof typeof GO].path)
      }
      return
    }
    const action = {
      g: () => {
        going.current = true
      },
      q: actions.newTask,
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
  const hintId = useId()
  const toggleHintId = useId()
  const [on, setOn] = useState(shortcutsOn)
  const toggle = (next: boolean): void => {
    setOn(next)
    try {
      localStorage.setItem(KEY, next ? 'on' : 'off')
    } catch {
      // Storage blocked: the shortcuts stay on.
    }
  }
  const rows = [
    ['q', t('newTask.title')],
    ['/', t('search.label')],
    ...Object.entries(GO).map(([key, { label }]) => [
      t('shortcuts.then', { key }),
      t(label)
    ]),
    ['?', t('shortcuts.title')]
  ]
  return (
    <Dialog
      open
      onClose={onClose}
      aria-labelledby={titleId}
      aria-describedby={hintId}
    >
      <DialogTitle id={titleId}>{t('shortcuts.title')}</DialogTitle>
      <DialogContent>
        <Typography id={hintId} className="u-mb-1">
          {t('shortcuts.hint')}
        </Typography>
        <FormControlLabel
          label={t('shortcuts.toggle')}
          control={
            <Switch
              checked={on}
              onChange={event => {
                toggle(event.target.checked)
              }}
              slotProps={{ input: { 'aria-describedby': toggleHintId } }}
            />
          }
        />
        <FormHelperText id={toggleHintId} className="u-mt-0 u-mb-1">
          {t('shortcuts.toggleHint')}
        </FormHelperText>
        <dl>
          {rows.map(([keys, label]) => (
            <div key={keys} className="u-flex u-mb-half">
              <Typography component="dt" className="u-w-4 u-mr-1">
                <kbd>{keys}</kbd>
              </Typography>
              <Typography component="dd">{label}</Typography>
            </div>
          ))}
        </dl>
      </DialogContent>
      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {t('shortcuts.close')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
