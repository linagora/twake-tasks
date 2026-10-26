import { Alert, Button } from '@linagora/twake-mui'
import { useEffect, useEffectEvent, useRef, type ReactElement } from 'react'

import type { SavedFilter } from '@/application/boards'
import { Toast } from '@/ds/Toast'
import {
  useDeleteFilter,
  useDeleteFilterNow,
  useUnpinDeletedFilter
} from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

/** What the list of views is opened with once a view's deletion is asked. */
export interface DeletedViewState {
  deletedView: SavedFilter
}

export const deletedViewOf = (state: unknown): SavedFilter | null =>
  typeof state === 'object' && state !== null && 'deletedView' in state
    ? (state as DeletedViewState).deletedView
    : null

/**
 * Says a view was deleted, with an Undo. The view leaves the favorites at
 * once, and is deleted when the notice goes, by timeout or by leaving the
 * page, unless Undo was clicked.
 */
export function DeletedViewNotice({
  view,
  onClose
}: {
  view: SavedFilter
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const { mutate: remove } = useDeleteFilter()
  const removeNow = useDeleteFilterNow()
  const unpinDeleted = useUnpinDeletedFilter()
  const settled = useRef(false)
  const leaving = useRef<number>(undefined)
  // An unloading page runs no effect cleanup and no timer. Closing the notice
  // keeps a page restored from the back-forward cache from offering an Undo
  // that can no longer work.
  const unload = useEffectEvent(() => {
    if (settled.current) return
    settled.current = true
    removeNow(view.id)
    onClose()
  })
  const unpin = useEffectEvent(() => {
    unpinDeleted(view, true)
  })
  useEffect(() => {
    unpin()
    window.addEventListener('pagehide', unload)
    // StrictMode unmounts once right after mounting: only a real unmount
    // lets the timer run.
    window.clearTimeout(leaving.current)
    return () => {
      window.removeEventListener('pagehide', unload)
      leaving.current = window.setTimeout(() => {
        if (!settled.current) remove(view.id)
      })
    }
  }, [view.id, remove])

  return (
    <Toast
      open
      autoHideDuration={6000}
      onClose={(_, reason) => {
        if (reason !== 'clickaway') onClose()
      }}
    >
      <Alert
        severity="success"
        role="status"
        action={
          <Button
            variant="text"
            size="small"
            onClick={() => {
              settled.current = true
              unpinDeleted(view, false)
              onClose()
            }}
          >
            {t('archive.undo')}
          </Button>
        }
      >
        {t('filters.viewDeleted', { name: view.name })}
      </Alert>
    </Toast>
  )
}
