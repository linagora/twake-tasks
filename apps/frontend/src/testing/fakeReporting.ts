import { vi, type Mock } from 'vitest'

import type { FeedbackWidget, Reporting } from '@/application/reporting'

export interface FakeReporting extends Reporting {
  reportCrash: Mock<Reporting['reportCrash']>
  attach: Mock<FeedbackWidget['attach']>
  setColorScheme: Mock<FeedbackWidget['setColorScheme']>
  detach: Mock<() => void>
}

export function fakeReporting({
  feedback = true
}: { feedback?: boolean } = {}): FakeReporting {
  const detach = vi.fn<() => void>()
  const attach = vi.fn<FeedbackWidget['attach']>(() => detach)
  const setColorScheme = vi.fn<FeedbackWidget['setColorScheme']>()
  return {
    reportCrash: vi.fn<Reporting['reportCrash']>(),
    feedback: feedback ? { attach, setColorScheme } : null,
    attach,
    setColorScheme,
    detach
  }
}
