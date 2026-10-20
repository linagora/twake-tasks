import type { Sdk } from '@linagora/twake-sdk'
import { Intents } from 'cozy-interapp'

import {
  DriveCancelledError,
  PROJECT_FOLDER,
  type Drive,
  type DriveDestination,
  type DriveFile,
  type PickerSession
} from '@/application/drive'

const ROOT_DIR = 'io.cozy.files.root-dir'
// As Twake Mail: numbered names first, then one no earlier upload can hold.
const MAX_NUMBERED_ATTEMPTS = 10
const MAX_FOLDER_PAGES = 10

class DriveError extends Error {
  readonly status: number

  constructor(path: string, status: number) {
    super(`${path} answered ${String(status)}`)
    this.status = status
  }
}

interface JsonApiFile {
  id: string
  attributes: {
    name: string | null
    type: string | null
    mime: string | null
    size: string | number | null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

function asFile(value: unknown): JsonApiFile | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null
  const attributes = isRecord(value.attributes) ? value.attributes : {}
  const text = (key: string) => {
    const field = attributes[key]
    return typeof field === 'string' ? field : null
  }
  const size = attributes.size
  return {
    id: value.id,
    attributes: {
      name: text('name'),
      type: text('type'),
      mime: text('mime'),
      size: typeof size === 'string' || typeof size === 'number' ? size : null
    }
  }
}

function dataOf(body: unknown): JsonApiFile {
  const file = asFile(isRecord(body) ? body.data : null)
  if (!file) throw new Error('The drive answered no document')
  return file
}

const listOf = (value: unknown): unknown[] =>
  Array.isArray(value) ? (value as unknown[]) : []

/** `report.pdf`, then `report (1).pdf`, and `report` gets the number appended. */
export function numberedName(name: string, attempt: number): string {
  if (attempt === 0) return name
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return `${name} (${String(attempt)})`
  return `${name.slice(0, dot)} (${String(attempt)})${name.slice(dot)}`
}

function pickedFile(doc: unknown): DriveFile | null {
  if (!isRecord(doc)) return null
  const text = (value: unknown) =>
    typeof value === 'string' && value.length > 0 ? value : null
  const id = text(doc.id) ?? text(doc._id) ?? text(doc.file_id)
  const url = text(doc.url) ?? text(doc.sharingLink)
  if (!id || !url) return null
  return {
    url,
    name: text(doc.name) ?? text(doc.filename) ?? url,
    mimeType: text(doc.mimeType),
    size: typeof doc.size === 'number' ? doc.size : null,
    driveFileId: id
  }
}

function pickedFiles(result: unknown): DriveFile[] {
  const docs = Array.isArray(result) ? result : [result]
  return docs.flatMap(doc => pickedFile(doc) ?? [])
}

/** What the drive needs of the platform client. */
export type DriveSdk = Pick<Sdk, 'fetch' | 'fetchJSON' | 'getAppURL'>

export function platformDrive(sdk: DriveSdk): Drive {
  async function send(
    path: string,
    init: RequestInit & { signal?: AbortSignal } = {}
  ): Promise<unknown> {
    let response: Response
    try {
      const headers = new Headers(init.headers)
      headers.set('Accept', 'application/vnd.api+json')
      response = await sdk.fetch(path, { ...init, headers })
    } catch (error) {
      if (init.signal?.aborted) throw new DriveCancelledError()
      throw error
    }
    if (!response.ok) throw new DriveError(path, response.status)
    return response.status === 204 ? null : response.json()
  }

  const json = (body: unknown) => ({
    headers: { 'Content-Type': 'application/vnd.api+json' },
    body: JSON.stringify(body)
  })

  // Under the drive routes for a team drive, the plain file routes otherwise.
  const routes = (destination: DriveDestination) =>
    destination.kind === 'team'
      ? {
          files: `/sharings/drives/${encodeURIComponent(destination.driveId)}`,
          permissions: `/sharings/drives/${encodeURIComponent(destination.driveId)}/permissions`
        }
      : { files: '/files', permissions: '/permissions' }

  async function teamRoot(driveId: string): Promise<string> {
    const drives = await send('/sharings/drives')
    for (const drive of listOf(isRecord(drives) ? drives.data : null)) {
      if (!isRecord(drive) || drive.id !== driveId) continue
      const attributes = isRecord(drive.attributes) ? drive.attributes : {}
      // The drive's root folder is the one its sharing rule names.
      const rule = listOf(attributes.rules)[0]
      const root = listOf(isRecord(rule) ? rule.values : null)[0]
      if (typeof root === 'string') return root
    }
    throw new Error(`No team drive ${driveId}`)
  }

  async function childFolder(
    base: string,
    parentId: string,
    name: string
  ): Promise<string | null> {
    let next: string | null = `${base}/${encodeURIComponent(parentId)}`
    for (let page = 0; next && page < MAX_FOLDER_PAGES; page++) {
      const body = await send(next)
      for (const item of listOf(isRecord(body) ? body.included : null)) {
        const doc = asFile(item)
        if (!doc) continue
        if (
          doc.attributes.type === 'directory' &&
          doc.attributes.name === name
        ) {
          return doc.id
        }
      }
      const links = isRecord(body) && isRecord(body.links) ? body.links : {}
      next = typeof links.next === 'string' ? links.next : null
    }
    return null
  }

  async function projectFolder(destination: DriveDestination): Promise<string> {
    const { files } = routes(destination)
    if (destination.kind === 'personal') {
      try {
        return dataOf(
          await send(
            `/files/metadata?Path=${encodeURIComponent(`/${PROJECT_FOLDER}`)}`
          )
        ).id
      } catch (error) {
        if (!(error instanceof DriveError && error.status === 404)) throw error
      }
    }
    const parent =
      destination.kind === 'team'
        ? await teamRoot(destination.driveId)
        : ROOT_DIR
    if (destination.kind === 'team') {
      const found = await childFolder(files, parent, PROJECT_FOLDER)
      if (found) return found
    }
    try {
      return dataOf(
        await send(
          `${files}/${encodeURIComponent(parent)}?Type=directory&Name=${encodeURIComponent(PROJECT_FOLDER)}`,
          { method: 'POST' }
        )
      ).id
    } catch (error) {
      // Made meanwhile, by another upload of the same batch or another tab.
      if (!(error instanceof DriveError && error.status === 409)) throw error
      return destination.kind === 'team'
        ? ((await childFolder(files, parent, PROJECT_FOLDER)) ??
            Promise.reject(error))
        : dataOf(
            await send(
              `/files/metadata?Path=${encodeURIComponent(`/${PROJECT_FOLDER}`)}`
            )
          ).id
    }
  }

  async function uploadOnce(
    files: string,
    folderId: string,
    file: File,
    name: string,
    signal: AbortSignal
  ): Promise<JsonApiFile> {
    return dataOf(
      await send(
        `${files}/${encodeURIComponent(folderId)}?Type=file&Name=${encodeURIComponent(name)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
          signal
        }
      )
    )
  }

  async function shareLink(
    destination: DriveDestination,
    fileId: string,
    signal: AbortSignal
  ): Promise<string> {
    const body = await send(`${routes(destination).permissions}?codes=code`, {
      method: 'POST',
      ...json({
        data: {
          type: 'io.cozy.permissions',
          attributes: {
            permissions: {
              files: { type: 'io.cozy.files', verbs: ['GET'], values: [fileId] }
            }
          }
        }
      }),
      signal
    })
    const data = isRecord(body) && isRecord(body.data) ? body.data : {}
    const attributes = isRecord(data.attributes) ? data.attributes : {}
    const codes = isRecord(attributes.shortcodes)
      ? attributes.shortcodes
      : isRecord(attributes.codes)
        ? attributes.codes
        : {}
    const code = codes.code
    if (typeof code !== 'string' || code === '') {
      throw new Error('The drive gave no share code')
    }
    const driveApp = await sdk.getAppURL('drive')
    if (!driveApp) throw new Error('Twake Drive is not installed')
    const link = new URL('/public', driveApp)
    link.searchParams.set('sharecode', code)
    return link.href
  }

  return {
    pick(container, labels, onReadyToUse): PickerSession {
      let stopped = false
      const { promise: whenStopped, resolve: endWait } =
        Promise.withResolvers<null>()
      const intents = new Intents({
        fetch: (method, path, body) =>
          sdk.fetchJSON(path, {
            method,
            ...(body === undefined ? {} : json(body))
          })
      })
      const intent = intents.create(
        'PICK',
        'io.cozy.files',
        {
          multiple: true,
          sharingLink: { label: labels.addLabel },
          downloadLink: null,
          displayCloseButton: true
        },
        ['GET']
      )
      const started = intent.start(container, { onReadyToUse })
      // stop() does nothing until the intent exists: stop again once it does.
      intent.then(
        () => {
          if (stopped) started.stop()
        },
        () => undefined
      )
      const files = Promise.race([
        started.then(pickedFiles),
        // A stopped intent never settles.
        whenStopped.then(() => [])
      ])
      return {
        files,
        stop: () => {
          stopped = true
          started.stop()
          endWait(null)
        }
      }
    },

    async upload(file, destination, signal) {
      // A call, not a property, since the signal changes while awaiting.
      const cancelled = () => signal.aborted
      const folderId = await projectFolder(destination)
      if (cancelled()) throw new DriveCancelledError()
      const { files } = routes(destination)
      let uploaded: JsonApiFile | null = null
      for (let attempt = 0; !uploaded; attempt++) {
        const last = attempt === MAX_NUMBERED_ATTEMPTS
        const name = last
          ? numberedName(file.name, Date.now())
          : numberedName(file.name, attempt)
        try {
          uploaded = await uploadOnce(files, folderId, file, name, signal)
        } catch (error) {
          if (!(error instanceof DriveError && error.status === 409) || last) {
            throw error
          }
        }
      }
      // Uploaded but cancelled: no link is made, so none reaches the task.
      if (cancelled()) throw new DriveCancelledError()
      const url = await shareLink(destination, uploaded.id, signal)
      if (cancelled()) throw new DriveCancelledError()
      const size = Number(uploaded.attributes.size ?? file.size)
      return {
        url,
        name: uploaded.attributes.name ?? file.name,
        mimeType: uploaded.attributes.mime ?? (file.type || null),
        size: Number.isFinite(size) ? size : null,
        driveFileId: uploaded.id
      }
    }
  }
}
