import { vi, type Mock } from 'vitest'

import type { FeedbackTexts, Reporting } from '@/application/reporting'

export interface FakeReporting extends Reporting {
  reportCrash: Mock<Reporting['reportCrash']>
  mount: Mock<(texts: FeedbackTexts) => () => void>
  unmount: Mock<() => void>
}

export function fakeReporting({
  feedback = true
}: { feedback?: boolean } = {}): FakeReporting {
  const unmount = vi.fn<() => void>()
  const mount = vi.fn<(texts: FeedbackTexts) => () => void>(() => unmount)
  return {
    reportCrash: vi.fn<Reporting['reportCrash']>(),
    feedback: feedback ? { mount } : null,
    mount,
    unmount
  }
}
