import { createContext, use, type ReactElement, type ReactNode } from 'react'

import { noReporting, type Reporting } from '@/application/reporting'

const ReportingContext = createContext<Reporting>(noReporting)

export function useReporting(): Reporting {
  return use(ReportingContext)
}

export function ReportingProvider({
  reporting,
  children
}: {
  reporting: Reporting
  children: ReactNode
}): ReactElement {
  return <ReportingContext value={reporting}>{children}</ReportingContext>
}
