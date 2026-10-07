import { SdkProvider, TwakeBar, type TwakeBarSlots } from '@linagora/twake-bar'
import type { Sdk } from '@linagora/twake-sdk'
import type { ReactElement } from 'react'

import projectTextIcon from '@/assets/project-text.svg?url'
import projectIcon from '@/assets/project.svg'
import { PlatformBarFrame } from '@/ds/AppFrame'
import { useI18n } from '@/ui/i18n/useI18n'
import { useSession } from '@/ui/session/SessionGate'

/**
 * The platform top bar: home, the other apps and the account. Shown once the
 * SSO named the user's platform, which exchanges the id token for its own.
 */
export function PlatformBar({
  sdk,
  slots
}: {
  sdk: Sdk
  slots: TwakeBarSlots
}): ReactElement {
  const { t } = useI18n()
  const { signOut } = useSession()

  return (
    <SdkProvider client={sdk}>
      <PlatformBarFrame>
        <TwakeBar
          app={{
            slug: 'project',
            name: t('app.name'),
            icon: new URL(projectIcon, window.location.origin).href,
            textIcon: new URL(projectTextIcon, window.location.origin).href
          }}
          slots={slots}
          onLogOut={() => void signOut()}
        />
      </PlatformBarFrame>
    </SdkProvider>
  )
}
