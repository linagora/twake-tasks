import '@linagora/twake-css/dist/utils.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { oidcSession, readSsoConfig } from '@/adapters/oidc/oidcSession'
import { App } from '@/app/App'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')

const session = oidcSession(readSsoConfig(window, window.location.origin))

createRoot(container).render(
  <StrictMode>
    <App session={session} />
  </StrictMode>
)
