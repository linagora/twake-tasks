import type { Sdk } from '@linagora/twake-sdk'
import {
  createContext,
  use,
  useMemo,
  type ReactElement,
  type ReactNode
} from 'react'

import type { Drive } from '@/application/drive'
import { useSession } from '@/ui/session/SessionGate'

type DriveSource =
  /** The drive of the signed-in person's platform. */
  | { makeDrive: (sdk: Sdk) => Drive }
  /** A drive of its own, or none. */
  | { drive: Drive | null }

const DriveContext = createContext<DriveSource>({ drive: null })

/** The person's Twake Drive, null without a Twake Workplace platform. */
export function useDrive(): Drive | null {
  const source = use(DriveContext)
  const { sdk } = useSession()
  return useMemo(() => {
    if ('drive' in source) return source.drive
    return sdk ? source.makeDrive(sdk) : null
  }, [source, sdk])
}

export function DriveProvider({
  source,
  children
}: {
  source: DriveSource
  children: ReactNode
}): ReactElement {
  return <DriveContext value={source}>{children}</DriveContext>
}
