import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'

let api: Awaited<ReturnType<typeof startApp>>

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
})

async function aBoardOf(owner: TestUser, keyPrefix: string) {
  const { id } = (
    await api.as(owner).post('/boards', { name: keyPrefix, keyPrefix })
  ).json<{ id: string }>()
  return {
    add: async (title: string, description?: string) => {
      const task = (
        await api
          .as(owner)
          .post(`/boards/${id}/tasks`, { sectionId: null, title })
      ).json<{ id: string }>()
      if (description) {
        await api.as(owner).put(`/boards/${id}/tasks/${task.id}/description`, {
          markdown: description,
          version: 0
        })
      }
      return task
    }
  }
}

const search = async (user: TestUser, q: string) =>
  (await api.as(user).get(`/search?${new URLSearchParams({ q }).toString()}`))
    .json<{ tasks: { key: string }[] }>()
    .tasks.map(task => task.key)

describe('search', () => {
  it('finds tasks by title, key or description', async () => {
    const owner = aUser()
    const design = await aBoardOf(owner, 'DES')
    const home = await aBoardOf(owner, 'HOM')
    await design.add('New logo')
    await design.add('Poster', 'Use the **new** palette')
    await home.add('Groceries')

    expect(await search(owner, 'NEW')).toEqual(['DES-1', 'DES-2'])
    expect(await search(owner, 'hom-1')).toEqual(['HOM-1'])
    expect(await search(owner, 'palette')).toEqual(['DES-2'])
    expect(await search(owner, '100%')).toEqual([])
  })

  it('quotes the part of the description that matches, when the title does not', async () => {
    const owner = aUser()
    const design = await aBoardOf(owner, 'DES')
    await design.add('Poster', 'Use the **new** palette')
    await design.add(
      'Brochure',
      `${'Intro sentence. '.repeat(10)}Print it on recycled paper for the spring fair. ${'Closing words. '.repeat(10)}`
    )
    await design.add('Palette swatches', 'Pick a palette')

    const found = (await api.as(owner).get('/search?q=palet')).json<{
      tasks: { key: string; excerpt: string | null }[]
    }>().tasks
    const recycled = (await api.as(owner).get('/search?q=RECYCLED')).json<{
      tasks: { key: string; excerpt: string | null }[]
    }>().tasks

    expect(found).toEqual([
      expect.objectContaining({ key: 'DES-1', excerpt: 'Use the new palette' }),
      expect.objectContaining({ key: 'DES-3', excerpt: null })
    ])
    expect(recycled).toEqual([
      expect.objectContaining({
        key: 'DES-2',
        excerpt:
          '…Intro sentence. Print it on recycled paper for the spring fair. Closing words. Closing…'
      })
    ])
  })

  it('only finds tasks on boards I can see', async () => {
    const owner = aUser()
    const stranger = aUser({ organizationId: owner.organizationId })
    await (await aBoardOf(owner, 'SEC')).add('Secret plan')

    expect(await search(stranger, 'secret')).toEqual([])
  })

  it('refuses an empty query', async () => {
    const response = await api.as(aUser()).get('/search?q=%20')

    expect(response.statusCode).toBe(400)
  })
})
