import '@linagora/twake-css/dist/utils.css'

import { connectSpaceOverlay } from '@linagora/twake-mui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import {
  isDrivePickerEnabled,
  twakeDrivePicker
} from '@/adapters/drive/twakeDrivePicker'
import { httpBoardsApi } from '@/adapters/http/httpBoardsApi'
import { embedSession, isEmbedded } from '@/adapters/oidc/embedSession'
import {
  intentSsoConfig,
  oidcSession,
  readSsoConfig,
  sendSignedIn
} from '@/adapters/oidc/oidcSession'
import { relayCallback } from '@/adapters/oidc/ssoFrame'
import {
  readSentryConfig,
  startSentry
} from '@/adapters/sentry/sentryReporting'
import { App } from '@/app/App'
import { isIntentsPath } from '@/application/taskIntent'
import { connectTwakeSpace } from '@/ui/embed/twakeSpace'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')

const apiUrl = window.location.origin
const config = readSsoConfig(window, apiUrl)

if (!relayCallback()) {
  const reporting = startSentry(readSentryConfig(window), __APP_VERSION__)
  // Framed by another app of the Workplace, for one of its intents
  const intents = isIntentsPath(window.location.pathname)
  const space = intents ? null : connectTwakeSpace()
  // A framed page never leaves for the SSO, neither on a 401
  const embed = intents
    ? embedSession(intentSsoConfig(config))
    : isEmbedded()
      ? embedSession(config)
      : null
  const session = embed ?? oidcSession(config)
  const boardsApi = httpBoardsApi(
    apiUrl,
    embed?.send ?? sendSignedIn,
    reporting.reportApiMismatch
  )
  // Framed by TwakeSpace, the dialogs and the side panel go onto its page:
  // the region they cover is sent to TwakeSpace, which shows that part only
  const overlay =
    embed && !intents
      ? connectSpaceOverlay(region => space?.reportOverlayRegion(region))
      : null

  createRoot(container, {
    onUncaughtError: (error, { componentStack }) => {
      console.error(error, componentStack)
      reporting.reportCrash(error, componentStack ?? null)
    }
  }).render(
    <StrictMode>
      <App
        session={session}
        boardsApi={boardsApi}
        overlay={overlay}
        reporting={reporting}
        drivePicker={isDrivePickerEnabled(window) ? twakeDrivePicker : null}
      />
    </StrictMode>
  )
}
