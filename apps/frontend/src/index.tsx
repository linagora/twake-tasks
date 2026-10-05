import '@linagora/twake-css/dist/utils.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { httpBoardsApi } from '@/adapters/http/httpBoardsApi'
import {
  oidcSession,
  readSsoConfig,
  sendSignedIn
} from '@/adapters/oidc/oidcSession'
import { App } from '@/app/App'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')

const apiUrl = window.location.origin
const session = oidcSession(readSsoConfig(window, apiUrl))
const boardsApi = httpBoardsApi(apiUrl, sendSignedIn)

createRoot(container).render(
  <StrictMode>
    <App session={session} boardsApi={boardsApi} />
  </StrictMode>
)
