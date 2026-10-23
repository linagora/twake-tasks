import { describe, expect, it, vi } from 'vitest'

import { DriveCancelledError } from '@/application/drive'
import {
  numberedName,
  platformDrive,
  type DriveSdk
} from '@/adapters/drive/platformDrive'

type Route = (init: RequestInit) => Response | Promise<Response>

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/vnd.api+json' }
  })

const fileDoc = (id: string, name: string) => ({
  data: {
    id,
    type: 'io.cozy.files',
    attributes: { name, mime: 'application/pdf', size: '2400' }
  }
})

const shared = (code: string) => ({
  data: { attributes: { shortcodes: { code } } }
})

/** A platform answering each "METHOD path" in turn, the last answer repeated. */
function fakeSdk(routes: Record<string, Route[]>) {
  const calls: string[] = []
  const sdk: DriveSdk = {
    fetch: vi.fn((path: string, init: RequestInit = {}) => {
      const key = `${init.method ?? 'GET'} ${path}`
      calls.push(key)
      const answers = routes[key]
      const answer = answers?.length === 1 ? answers[0] : answers?.shift()
      if (!answer) return Promise.resolve(json(404, {}))
      return Promise.resolve(answer(init))
    }),
    fetchJSON: vi.fn(),
    getAppURL: vi.fn(() => Promise.resolve('https://alice-drive.example.com/'))
  }
  return { sdk, calls }
}

const report = new File(['%PDF'], 'report.pdf', { type: 'application/pdf' })

describe('platformDrive', () => {
  it('makes the Project folder, uploads into it and shares the file by link', async () => {
    const { sdk, calls } = fakeSdk({
      'GET /files/metadata?Path=%2FProject': [() => json(404, {})],
      'POST /files/io.cozy.files.root-dir?Type=directory&Name=Project': [
        () => json(201, fileDoc('dir-project', 'Project'))
      ],
      'POST /files/dir-project?Type=file&Name=report.pdf': [
        () => json(201, fileDoc('file-1', 'report.pdf'))
      ],
      'POST /permissions?codes=code': [() => json(200, shared('abc'))]
    })

    const file = await platformDrive(sdk).upload(
      report,
      { kind: 'personal' },
      new AbortController().signal
    )

    expect(file).toEqual({
      url: 'https://alice-drive.example.com/public?sharecode=abc',
      name: 'report.pdf',
      mimeType: 'application/pdf',
      size: 2400,
      driveFileId: 'file-1'
    })
    expect(calls).toHaveLength(4)
  })

  it('shares the file for reading only', async () => {
    let permission: unknown = null
    const { sdk } = fakeSdk({
      'GET /files/metadata?Path=%2FProject': [
        () => json(200, fileDoc('dir-project', 'Project'))
      ],
      'POST /files/dir-project?Type=file&Name=report.pdf': [
        () => json(201, fileDoc('file-1', 'report.pdf'))
      ],
      'POST /permissions?codes=code': [
        init => {
          permission = JSON.parse(
            typeof init.body === 'string' ? init.body : ''
          )
          return json(200, shared('abc'))
        }
      ]
    })

    await platformDrive(sdk).upload(
      report,
      { kind: 'personal' },
      new AbortController().signal
    )

    expect(permission).toEqual({
      data: {
        type: 'io.cozy.permissions',
        attributes: {
          permissions: {
            files: { type: 'io.cozy.files', verbs: ['GET'], values: ['file-1'] }
          }
        }
      }
    })
  })

  it('numbers the name of a file the folder already holds, as Twake Mail does', async () => {
    const { sdk, calls } = fakeSdk({
      'GET /files/metadata?Path=%2FProject': [
        () => json(200, fileDoc('dir-project', 'Project'))
      ],
      'POST /files/dir-project?Type=file&Name=report.pdf': [
        () => json(409, {})
      ],
      'POST /files/dir-project?Type=file&Name=report%20(1).pdf': [
        () => json(201, fileDoc('file-1', 'report (1).pdf'))
      ],
      'POST /permissions?codes=code': [() => json(200, shared('abc'))]
    })

    const file = await platformDrive(sdk).upload(
      report,
      { kind: 'personal' },
      new AbortController().signal
    )

    expect(file.name).toBe('report (1).pdf')
    expect(calls).toContain(
      'POST /files/dir-project?Type=file&Name=report%20(1).pdf'
    )
  })

  it('puts the file of a space board in the Project folder of its team drive', async () => {
    const { sdk, calls } = fakeSdk({
      'GET /sharings/drives': [
        () =>
          json(200, {
            data: [
              {
                id: 'drive-space',
                attributes: { rules: [{ values: ['dir-root'] }] }
              }
            ]
          })
      ],
      'GET /sharings/drives/drive-space/dir-root': [
        () =>
          json(200, {
            data: { id: 'dir-root' },
            included: [
              { id: 'dir-x', attributes: { type: 'directory', name: 'Other' } },
              {
                id: 'dir-project',
                attributes: { type: 'directory', name: 'Project' }
              }
            ]
          })
      ],
      'POST /sharings/drives/drive-space/dir-project?Type=file&Name=report.pdf':
        [() => json(201, fileDoc('file-1', 'report.pdf'))],
      'POST /sharings/drives/drive-space/permissions?codes=code': [
        () => json(200, shared('team'))
      ]
    })

    const file = await platformDrive(sdk).upload(
      report,
      { kind: 'team', driveId: 'drive-space' },
      new AbortController().signal
    )

    expect(file.url).toBe(
      'https://alice-drive.example.com/public?sharecode=team'
    )
    expect(calls).not.toContain('GET /files/metadata?Path=%2FProject')
  })

  it('makes the Project folder of a team drive that has none', async () => {
    const { sdk, calls } = fakeSdk({
      'GET /sharings/drives': [
        () =>
          json(200, {
            data: [
              {
                id: 'drive-space',
                attributes: { rules: [{ values: ['dir-root'] }] }
              }
            ]
          })
      ],
      'GET /sharings/drives/drive-space/dir-root': [
        () => json(200, { data: { id: 'dir-root' }, included: [] })
      ],
      'POST /sharings/drives/drive-space/dir-root?Type=directory&Name=Project':
        [() => json(201, fileDoc('dir-project', 'Project'))],
      'POST /sharings/drives/drive-space/dir-project?Type=file&Name=report.pdf':
        [() => json(201, fileDoc('file-1', 'report.pdf'))],
      'POST /sharings/drives/drive-space/permissions?codes=code': [
        () => json(200, shared('team'))
      ]
    })

    await platformDrive(sdk).upload(
      report,
      { kind: 'team', driveId: 'drive-space' },
      new AbortController().signal
    )

    expect(calls).toContain(
      'POST /sharings/drives/drive-space/dir-root?Type=directory&Name=Project'
    )
  })

  it('makes no link for an upload cancelled once it landed', async () => {
    const controller = new AbortController()
    const { sdk, calls } = fakeSdk({
      'GET /files/metadata?Path=%2FProject': [
        () => json(200, fileDoc('dir-project', 'Project'))
      ],
      'POST /files/dir-project?Type=file&Name=report.pdf': [
        () => {
          controller.abort()
          return json(201, fileDoc('file-1', 'report.pdf'))
        }
      ]
    })

    await expect(
      platformDrive(sdk).upload(report, { kind: 'personal' }, controller.signal)
    ).rejects.toBeInstanceOf(DriveCancelledError)
    expect(calls).not.toContain('POST /permissions?codes=code')
  })
})

describe('numberedName', () => {
  it('numbers before the extension, or after a name without one', () => {
    expect(numberedName('report.pdf', 0)).toBe('report.pdf')
    expect(numberedName('report.pdf', 2)).toBe('report (2).pdf')
    expect(numberedName('archive.tar.gz', 1)).toBe('archive.tar (1).gz')
    expect(numberedName('README', 1)).toBe('README (1)')
    expect(numberedName('.env', 1)).toBe('.env (1)')
  })
})
