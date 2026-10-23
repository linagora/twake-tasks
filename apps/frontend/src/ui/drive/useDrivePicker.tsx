import { useColorScheme } from '@linagora/twake-mui'
import type { Sdk } from '@linagora/twake-sdk'
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'

import type { DriveLink, DrivePicker } from '@/application/drivePicker'
import { IntentDialog } from '@/ds/IntentDialog'
import type { LinkPicker } from '@/ds/RichText'
import { useI18n } from '@/ui/i18n/useI18n'
import { useSession } from '@/ui/session/SessionGate'

/** Opens Twake Drive on the user's platform. */
export type ConnectDrive = (sdk: Sdk, idToken: string) => DrivePicker

const DriveContext = createContext<ConnectDrive | null>(null)

/** `connect` is null when the Drive picker is turned off. */
export function DrivePickerProvider({
  connect,
  children
}: {
  connect: ConnectDrive | null
  children: ReactNode
}): ReactElement {
  return <DriveContext value={connect}>{children}</DriveContext>
}

/**
 * The Drive button of a rich text toolbar and the dialog of the picker.
 * Neither when the picker is off or the SSO named no platform.
 */
export function useDrivePicker(): {
  linkPicker: LinkPicker | undefined
  dialog: ReactElement | null
} {
  const { t } = useI18n()
  const connect = use(DriveContext)
  const { sdk, user } = useSession()
  const { idToken } = user
  const picker = useMemo(
    () => (connect && sdk && idToken ? connect(sdk, idToken) : null),
    [connect, sdk, idToken]
  )
  const { colorScheme } = useColorScheme()
  const theme = colorScheme === 'dark' ? 'dark' : 'light'
  const linkLabel = t('drive.insertLinks')
  const failed = t('drive.failed')
  const [request, setRequest] = useState<{
    resolve: (links: readonly DriveLink[]) => void
  } | null>(null)
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Drive draws its own close button once ready: one at a time
  const [isReady, setIsReady] = useState(false)
  const [isCloseAsked, setIsCloseAsked] = useState(false)

  useEffect(() => {
    if (!picker || !request || !container) return
    let isCurrent = true
    picker
      .pick(container, {
        linkLabel,
        theme,
        onReady: () => {
          if (isCurrent) setIsReady(true)
        },
        onCloseButton: isShown => {
          if (isCurrent) setIsCloseAsked(isShown)
        }
      })
      .then(
        links => {
          if (!isCurrent) return
          request.resolve(links)
          setRequest(null)
        },
        (reason: unknown) => {
          if (!isCurrent) return
          console.error('The Drive picker failed:', reason)
          setError(failed)
        }
      )
    return () => {
      isCurrent = false
      picker.stop()
    }
  }, [picker, request, container, linkLabel, theme, failed])

  if (!picker) return { linkPicker: undefined, dialog: null }
  const close = () => {
    request?.resolve([])
    setRequest(null)
  }
  return {
    linkPicker: {
      label: t('editor.drive'),
      pick: () =>
        new Promise(resolve => {
          setError(null)
          setIsReady(false)
          setIsCloseAsked(false)
          setRequest({ resolve })
        })
    },
    dialog: (
      <IntentDialog
        open={request !== null}
        title={t('drive.title')}
        error={error}
        onClose={close}
        onContainer={setContainer}
        closeButton={{
          label: t('drive.close'),
          isShown: !isReady || error !== null || isCloseAsked
        }}
      />
    )
  }
}
