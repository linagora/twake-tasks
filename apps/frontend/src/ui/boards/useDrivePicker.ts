import { useCallback, useEffect, useRef, useState } from 'react'

import type { Drive, DriveFile, PickerSession } from '@/application/drive'

export interface DrivePicker {
  open: boolean
  ready: boolean
  failed: boolean
  /** Where the picker's frame goes: it starts once the element is there. */
  containerRef: (element: HTMLDivElement | null) => void
  show: () => void
  close: () => void
  dismissFailure: () => void
}

/** Twake Calendar's way to pick files of Twake Drive. */
export function useDrivePicker({
  drive,
  addLabel,
  onPicked
}: {
  drive: Drive | null
  addLabel: string
  onPicked: (files: DriveFile[]) => void
}): DrivePicker {
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const session = useRef<PickerSession | null>(null)
  const latest = useRef({ onPicked, addLabel })
  useEffect(() => {
    latest.current = { onPicked, addLabel }
  })

  const close = useCallback(() => {
    session.current?.stop()
    session.current = null
    setOpen(false)
  }, [])

  const containerRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element || !drive || session.current) return
      setReady(false)
      const started = drive.pick(
        element,
        { addLabel: latest.current.addLabel },
        () => {
          setReady(true)
        }
      )
      session.current = started
      started.files.then(
        files => {
          // A picker closed meanwhile has nothing to give.
          if (session.current !== started) return
          session.current = null
          setOpen(false)
          if (files.length > 0) latest.current.onPicked(files)
        },
        (error: unknown) => {
          if (session.current !== started) return
          console.error('The Twake Drive picker failed:', error)
          session.current = null
          setOpen(false)
          setFailed(true)
        }
      )
    },
    [drive]
  )

  useEffect(() => () => session.current?.stop(), [])

  return {
    open,
    ready,
    failed,
    containerRef,
    show: () => {
      setFailed(false)
      setOpen(true)
    },
    close,
    dismissFailure: () => {
      setFailed(false)
    }
  }
}
