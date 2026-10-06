import { FeedbackButton, getFeedbackLabels } from '@linagora/twake-feedback'
import { useColorScheme, useMediaQuery, useTheme } from '@linagora/twake-mui'
import { useCallback, useEffect, type ReactElement } from 'react'

import type { FeedbackWidget } from '@/application/reporting'
import { useI18n } from '@/ui/i18n/useI18n'
import { useReporting } from '@/ui/reporting/ReportingProvider'

// Height of the bottom bar the sidebar becomes below lg: twake-mui sets
// --sidebarHeight to 52px on :root.
const PHONE_BAR_HEIGHT = 52

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
  const theme = useTheme()
  const phone = useMediaQuery(theme.breakpoints.down('lg'))
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
      bottomOffset={phone ? PHONE_BAR_HEIGHT : 0}
    />
  )
}
