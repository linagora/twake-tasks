/** A public, read-only sharing link of a Twake Drive file or folder. */
export interface DriveLink {
  name: string
  url: string
}

export interface DrivePickOptions {
  /** The label of Drive's button that gives the links. */
  linkLabel: string
  theme: 'light' | 'dark'
  /** The picker is ready and shows its own close button. */
  onReady: () => void
  /** The picker asks for the close button of the dialog, or gives it up. */
  onCloseButton: (isShown: boolean) => void
}

/** The file picker of Twake Drive, on the user's workplace. */
export interface DrivePicker {
  /**
   * Shows the picker in `container`. Resolves to the links picked, none when
   * the user cancels; rejects when Drive cannot be reached.
   */
  pick: (
    container: HTMLElement,
    options: DrivePickOptions
  ) => Promise<readonly DriveLink[]>
  /** Closes the picker shown, if any. */
  stop: () => void
}
