export interface FeedbackWidget {
  /**
   * Opens the feedback form when `el` is clicked, with the texts of the form
   * by Sentry's label name. The returned function detaches it and removes the
   * form.
   */
  attach: (
    el: HTMLElement,
    labels: Readonly<Record<string, string>>
  ) => () => void
  /** Follows the light or dark theme of the app in the form. */
  setColorScheme: (scheme: 'light' | 'dark' | 'system') => void
}

export interface Reporting {
  /** Sends an error the app caught at the edge of a screen or of the root. */
  reportCrash: (error: unknown, componentStack: string | null) => void
  /** Null when feedback is not turned on. */
  feedback: FeedbackWidget | null
}

export const noReporting: Reporting = {
  reportCrash: () => undefined,
  feedback: null
}
