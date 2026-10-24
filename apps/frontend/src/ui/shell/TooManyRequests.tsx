import { useAlert } from '@linagora/twake-mui'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { ApiError } from '@/application/boards'
import { useI18n } from '@/ui/i18n/useI18n'

const ALERT_MS = 8000

function tooManyRequests(error: unknown): boolean {
  return error instanceof ApiError && error.status === 429
}

/** Tells the user once when the server refuses requests for coming too fast. */
export function TooManyRequests(): null {
  const queryClient = useQueryClient()
  const { showAlert } = useAlert()
  const { t } = useI18n()
  // Requests refused together say so once, not once each.
  const shownAt = useRef(-Infinity)

  useEffect(() => {
    const refused = (error: unknown) => {
      if (!tooManyRequests(error)) return
      const now = Date.now()
      if (now - shownAt.current < ALERT_MS) return
      shownAt.current = now
      showAlert({
        message: t('problems.tooManyRequests'),
        severity: 'warning',
        duration: ALERT_MS
      })
    }
    const stopQueries = queryClient.getQueryCache().subscribe(event => {
      if (event.type === 'updated' && event.action.type === 'error') {
        refused(event.action.error)
      }
    })
    const stopMutations = queryClient.getMutationCache().subscribe(event => {
      if (event.type === 'updated' && event.action.type === 'error') {
        refused(event.action.error)
      }
    })
    return () => {
      stopQueries()
      stopMutations()
    }
  }, [queryClient, showAlert, t])

  return null
}
