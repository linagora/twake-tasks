/** Every label of the feedback form and of its button. */
export interface FeedbackTexts {
  triggerLabel: string
  triggerAriaLabel: string
  formTitle: string
  messageLabel: string
  messagePlaceholder: string
  emailLabel: string
  emailPlaceholder: string
  submitButtonLabel: string
  cancelButtonLabel: string
  confirmButtonLabel: string
  successMessageText: string
  isRequiredLabel: string
  addScreenshotButtonLabel: string
  removeScreenshotButtonLabel: string
  highlightToolText: string
  hideToolText: string
  removeHighlightText: string
  errorEmptyMessageText: string
  errorNoClientText: string
  errorTimeoutText: string
  errorForbiddenText: string
  errorGenericText: string
}

/** Id of the element that holds the feedback button, to place it from the page. */
export const FEEDBACK_HOST_ID = 'twake-tasks-feedback'

export interface FeedbackWidget {
  /** Shows the feedback button; the returned function removes it. */
  mount: (texts: FeedbackTexts) => () => void
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
