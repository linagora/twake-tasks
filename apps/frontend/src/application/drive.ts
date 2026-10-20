/** A file of Twake Drive, as a task links to it. */
export interface DriveFile {
  /** A public, read-only link to the file. */
  url: string
  name: string
  mimeType: string | null
  size: number | null
  /** The file in the drive, when Tasks put it there. */
  driveFileId: string | null
}

/** Where a file sent from the computer goes. */
export type DriveDestination =
  | { kind: 'personal' }
  /** The team drive of the board's space. */
  | { kind: 'team'; driveId: string }

/** The folder the files of Tasks go to, in either drive. */
export const PROJECT_FOLDER = 'Project'

export class DriveCancelledError extends Error {
  constructor() {
    super('The transfer was cancelled')
  }
}

export interface PickerSession {
  /** Resolves with the files picked, empty when the picker was closed. */
  files: Promise<DriveFile[]>
  stop: () => void
}

/** The person's Twake Drive, on their Twake Workplace platform. */
export interface Drive {
  /** Opens Twake Drive's own file picker inside the element, as Twake Calendar does. */
  pick: (
    container: HTMLElement,
    labels: { addLabel: string },
    onReadyToUse: () => void
  ) => PickerSession
  /** Uploads to the Project folder and shares the file by link. Rejects with DriveCancelledError once aborted. */
  upload: (
    file: File,
    destination: DriveDestination,
    signal: AbortSignal
  ) => Promise<DriveFile>
}
