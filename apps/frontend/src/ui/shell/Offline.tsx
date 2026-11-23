import { Alert } from '@linagora/twake-mui'
import { onlineManager } from '@tanstack/react-query'
import { useSyncExternalStore, type ReactElement } from 'react'

import { Toast } from '@/ds/Toast'
import { useI18n } from '@/ui/i18n/useI18n'

const subscribe = (onChange: () => void) => onlineManager.subscribe(onChange)
const isOnline = () => onlineManager.isOnline()

// Offline, react-query pauses requests instead of failing them, so no screen
// shows an error: the loads and saves just wait for the connection.
export function Offline(): ReactElement {
  const online = useSyncExternalStore(subscribe, isOnline)
  const { t } = useI18n()

  return (
    <Toast open={!online}>
      <Alert severity="warning" role="status">
        {t('problems.offline')}
      </Alert>
    </Toast>
  )
}
