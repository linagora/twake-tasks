import '@linagora/twake-css/dist/utils.css'

import { connectSpaceOverlay, overlayRegionMessage } from '@linagora/twake-mui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { httpBoardsApi } from '@/adapters/http/httpBoardsApi'
import { embedSession, isEmbedded } from '@/adapters/oidc/embedSession'
import {
  oidcSession,
  readSsoConfig,
  sendSignedIn
} from '@/adapters/oidc/oidcSession'
import { relayCallback } from '@/adapters/oidc/ssoFrame'
import { App } from '@/app/App'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')

const apiUrl = window.location.origin
const config = readSsoConfig(window, apiUrl)

if (!relayCallback()) {
  const embed = isEmbedded() ? embedSession(config) : null
  const session = embed ?? oidcSession(config)
  const boardsApi = httpBoardsApi(apiUrl, embed?.send ?? sendSignedIn)
  // Framed by TwakeSpace, the dialogs and the side panel go onto its page:
  // the region they cover is sent to TwakeSpace, which shows that part only
  const overlay = embed
    ? connectSpaceOverlay(region => {
        for (const origin of (window.TWAKE_SPACE_ORIGIN ?? '').split(' ')) {
          if (origin === '') continue
          window.parent.postMessage(overlayRegionMessage(region), origin)
        }
      })
    : null

  createRoot(container).render(
    <StrictMode>
      <App session={session} boardsApi={boardsApi} overlay={overlay} />
    </StrictMode>
  )
}
