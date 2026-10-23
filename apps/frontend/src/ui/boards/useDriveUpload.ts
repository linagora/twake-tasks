import { useRef, useState } from 'react'

import {
  DriveCancelledError,
  type Drive,
  type DriveDestination,
  type DriveFile
} from '@/application/drive'

export type UploadStatus =
  'waiting' | 'uploading' | 'linked' | 'failed' | 'cancelled'

export interface Upload {
  id: string
  file: File
  status: UploadStatus
}

export const isSettled = (status: UploadStatus): boolean =>
  status === 'linked' || status === 'failed' || status === 'cancelled'

export interface DriveUpload {
  /** The batch on screen, empty once it ended. */
  uploads: Upload[]
  /** Whether the last batch left a file out. */
  failed: boolean
  start: (files: File[]) => void
  cancel: (id: string) => void
  cancelAll: () => void
  dismissFailure: () => void
}

/**
 * Twake Mail's workflow for files too large to attach, for every file: each
 * goes to Twake Drive in turn, and the links of those that made it are added
 * once the batch ends.
 */
export function useDriveUpload({
  drive,
  destination,
  onLinked
}: {
  drive: Drive | null
  destination: DriveDestination
  onLinked: (files: DriveFile[]) => Promise<unknown>
}): DriveUpload {
  const [uploads, setUploads] = useState<Upload[]>([])
  const [failed, setFailed] = useState(false)
  const controllers = useRef(new Map<string, AbortController>())
  const running = useRef(false)

  const setStatus = (id: string, status: UploadStatus) => {
    setUploads(current =>
      current.map(upload => (upload.id === id ? { ...upload, status } : upload))
    )
  }

  const cancel = (id: string) => {
    const controller = controllers.current.get(id)
    if (!controller || controller.signal.aborted) return
    controller.abort()
    setStatus(id, 'cancelled')
  }

  const run = async (batch: Upload[]) => {
    if (!drive) return
    const linked: DriveFile[] = []
    let anyFailed = false
    for (const upload of batch) {
      const controller = controllers.current.get(upload.id)
      // A call, not a property: the signal changes while the upload runs.
      const aborted = () => controller?.signal.aborted ?? true
      if (!controller || aborted()) continue
      setStatus(upload.id, 'uploading')
      try {
        linked.push(
          await drive.upload(upload.file, destination, controller.signal)
        )
        setStatus(upload.id, 'linked')
      } catch (error) {
        if (error instanceof DriveCancelledError || aborted()) {
          continue
        }
        console.error('Upload to Twake Drive failed:', error)
        anyFailed = true
        setStatus(upload.id, 'failed')
      }
    }
    if (linked.length > 0) {
      try {
        await onLinked(linked)
      } catch (error) {
        console.error('The links could not be added:', error)
        anyFailed = true
      }
    }
    controllers.current.clear()
    running.current = false
    setUploads([])
    setFailed(anyFailed)
  }

  return {
    uploads,
    failed,
    start: files => {
      // One batch at a time, as in Twake Mail: the dialog shows that batch.
      if (running.current || files.length === 0) return
      running.current = true
      setFailed(false)
      const batch = files.map(file => ({
        id: crypto.randomUUID(),
        file,
        status: 'waiting' as const
      }))
      for (const upload of batch) {
        controllers.current.set(upload.id, new AbortController())
      }
      setUploads(batch)
      void run(batch)
    },
    cancel,
    cancelAll: () => {
      for (const id of controllers.current.keys()) cancel(id)
    },
    dismissFailure: () => {
      setFailed(false)
    }
  }
}
