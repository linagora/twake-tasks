import '@linagora/twake-css/dist/utils.css'

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

  createRoot(container).render(
    <StrictMode>
      <App session={session} boardsApi={boardsApi} />
    </StrictMode>
  )
}
