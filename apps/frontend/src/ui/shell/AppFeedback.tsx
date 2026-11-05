import { FeedbackButton, getFeedbackLabels } from '@linagora/twake-feedback'
import { useColorScheme } from '@linagora/twake-mui'
import { useCallback, useEffect, type ReactElement } from 'react'

import type { FeedbackWidget } from '@/application/reporting'
import { useNarrowScreen } from '@/ds/PhoneShell'
import { useI18n } from '@/ui/i18n/useI18n'
import { useReporting } from '@/ui/reporting/ReportingProvider'

// Room for the floating button of phones (PhoneFab): 56px and its edge.
const PHONE_FAB_ROOM = 72

/**
 * The draggable feedback button, when feedback is on. Mounted by the shell
 * only, so it never shows on an embedded view.
 */
export function AppFeedback(): ReactElement | null {
  const { feedback } = useReporting()

  return feedback ? <Button feedback={feedback} /> : null
}

function Button({ feedback }: { feedback: FeedbackWidget }): ReactElement {
  const { lang } = useI18n()
  const narrow = useNarrowScreen()
  const { colorScheme = 'system' } = useColorScheme()

  useEffect(() => {
    feedback.setColorScheme(colorScheme)
  }, [feedback, colorScheme])

  // Memoized: a new function detaches the form and closes it if it is open.
  const attach = useCallback(
    (el: HTMLElement) => feedback.attach(el, getFeedbackLabels(lang)),
    [feedback, lang]
  )

  return (
    <FeedbackButton
      attach={attach}
      storageKey="twake-tasks"
      bottomOffset={narrow ? PHONE_FAB_ROOM : 0}
    />
  )
}
