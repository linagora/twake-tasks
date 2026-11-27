// What the platform reads to offer the intent to the other apps.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Vitest runs from apps/frontend
const manifest = JSON.parse(
  readFileSync(resolve('../../manifest/manifest.webapp'), 'utf8')
) as Record<string, unknown>

describe('the manifest', () => {
  it('declares the intent CREATE io.cozy.tasks, served by /intents', () => {
    expect(manifest.intents).toEqual([
      { action: 'CREATE', type: ['io.cozy.tasks'], href: '/intents' }
    ])
  })

  it('names the flag that gives the stack the address of the intent page', () => {
    expect(manifest.service_url_flag).toBe('project.embedded-app-url')
  })
})
