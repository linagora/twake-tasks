import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'

let api: Awaited<ReturnType<typeof startApp>>

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
})

const aBoardOf = async (owner: TestUser, keyPrefix: string) =>
  (await api.as(owner).post('/boards', { name: keyPrefix, keyPrefix })).json<{
    id: string
  }>().id

const aViewOf = async (owner: TestUser, name: string) =>
  (await api.as(owner).post('/filters', { name, criteria: {} })).json<{
    id: string
  }>().id

const aSectionOf = async (owner: TestUser, name: string) =>
  (await api.as(owner).post('/sidebar/sections', { name })).json<{
    id: string
  }>().id

const sectionsOf = async (user: TestUser) =>
  (await api.as(user).get('/sidebar/sections')).json<{
    sections: {
      id: string
      name: string | null
      favorites: boolean
      items: object[]
    }[]
  }>().sections

const favoritesOf = async (user: TestUser) =>
  (await sectionsOf(user)).find(section => section.favorites)?.id ?? ''

const custom = (id: string, name: string, items: object[] = []) => ({
  id,
  name,
  favorites: false,
  items
})

describe('sidebar sections', () => {
  it('keeps my sections, in their order, with the boards and views I put in them, each in one only', async () => {
    const owner = aUser()
    const other = aUser({ organizationId: owner.organizationId })
    const design = await aBoardOf(owner, 'DES')
    const urgent = await aViewOf(owner, 'Urgent')
    const work = await aSectionOf(owner, 'Work')
    const home = await aSectionOf(owner, 'Home')

    const favorites = await favoritesOf(owner)

    const saved = await api.as(owner).put('/sidebar/sections', {
      sections: [
        { id: favorites, items: [] },
        {
          id: home,
          items: [
            { kind: 'view', id: urgent },
            { kind: 'board', id: design }
          ]
        },
        { id: work, items: [{ kind: 'board', id: design }] }
      ]
    })

    expect(saved.statusCode).toBe(204)
    expect(await sectionsOf(owner)).toEqual([
      { id: favorites, name: null, favorites: true, items: [] },
      custom(home, 'Home', [
        { kind: 'view', id: urgent },
        { kind: 'board', id: design }
      ]),
      custom(work, 'Work')
    ])
    expect(await sectionsOf(other)).toEqual([
      expect.objectContaining({ name: null, favorites: true, items: [] })
    ])
  })

  it('gives every sidebar a Favorites first, which I can rename and move but not delete or fill', async () => {
    const owner = aUser()
    const design = await aBoardOf(owner, 'DES')
    const work = await aSectionOf(owner, 'Work')
    const favorites = await favoritesOf(owner)

    expect((await sectionsOf(owner)).map(section => section.id)).toEqual([
      favorites,
      work
    ])
    expect(
      (
        await api
          .as(owner)
          .patch(`/sidebar/sections/${favorites}`, { name: 'Starred' })
      ).statusCode
    ).toBe(204)
    expect(
      (
        await api.as(owner).put('/sidebar/sections', {
          sections: [
            { id: work, items: [] },
            { id: favorites, items: [] }
          ]
        })
      ).statusCode
    ).toBe(204)
    expect(await sectionsOf(owner)).toEqual([
      custom(work, 'Work'),
      { id: favorites, name: 'Starred', favorites: true, items: [] }
    ])
    expect(
      (await api.as(owner).delete(`/sidebar/sections/${favorites}`)).statusCode
    ).toBe(403)
    expect(
      (
        await api.as(owner).put('/sidebar/sections', {
          sections: [
            { id: work, items: [] },
            { id: favorites, items: [{ kind: 'board', id: design }] }
          ]
        })
      ).statusCode
    ).toBe(400)
  })

  it('renames and deletes a section, mine only', async () => {
    const owner = aUser()
    const other = aUser({ organizationId: owner.organizationId })
    const work = await aSectionOf(owner, 'Work')

    expect(
      (await api.as(other).patch(`/sidebar/sections/${work}`, { name: 'Mine' }))
        .statusCode
    ).toBe(404)
    expect(
      (
        await api
          .as(owner)
          .patch(`/sidebar/sections/${work}`, { name: ' Job ' })
      ).statusCode
    ).toBe(204)
    expect((await sectionsOf(owner)).map(section => section.name)).toEqual([
      null,
      'Job'
    ])
    expect(
      (await api.as(other).delete(`/sidebar/sections/${work}`)).statusCode
    ).toBe(404)
    expect(
      (await api.as(owner).delete(`/sidebar/sections/${work}`)).statusCode
    ).toBe(204)
    expect(await sectionsOf(owner)).toEqual([
      expect.objectContaining({ favorites: true })
    ])
    expect(
      (await api.as(owner).post('/sidebar/sections', { name: '  ' })).statusCode
    ).toBe(400)
  })

  it('refuses a layout missing a section, or holding what I do not see', async () => {
    const owner = aUser()
    const stranger = aUser({ organizationId: owner.organizationId })
    const theirs = await aBoardOf(stranger, 'THE')
    const theirView = await aViewOf(stranger, 'Theirs')
    const work = await aSectionOf(owner, 'Work')
    await aSectionOf(owner, 'Home')

    const favorites = await favoritesOf(owner)

    const layout = (items: object[]) => ({
      sections: [
        { id: favorites, items: [] },
        { id: work, items }
      ]
    })
    expect(
      (await api.as(owner).put('/sidebar/sections', layout([]))).statusCode
    ).toBe(409)
    const home = (await sectionsOf(owner))[2]?.id ?? ''
    const both = (items: object[]) => ({
      sections: [
        { id: favorites, items: [] },
        { id: work, items },
        { id: home, items: [] }
      ]
    })
    expect(
      (
        await api
          .as(owner)
          .put('/sidebar/sections', both([{ kind: 'board', id: theirs }]))
      ).statusCode
    ).toBe(404)
    expect(
      (
        await api
          .as(owner)
          .put('/sidebar/sections', both([{ kind: 'view', id: theirView }]))
      ).statusCode
    ).toBe(404)
  })

  it('stars what a section holds, and takes it out once unstarred', async () => {
    const owner = aUser()
    const design = await aBoardOf(owner, 'DES')
    const urgent = await aViewOf(owner, 'Urgent')
    const work = await aSectionOf(owner, 'Work')
    const favoritesSection = await favoritesOf(owner)
    const favorites = async () => ({
      boards: (await api.as(owner).get('/boards'))
        .json<{ boards: { id: string; favorite: boolean }[] }>()
        .boards.filter(board => board.favorite)
        .map(board => board.id),
      views: (await api.as(owner).get('/filters'))
        .json<{ filters: { id: string; favorite: boolean }[] }>()
        .filters.filter(view => view.favorite)
        .map(view => view.id)
    })

    await api.as(owner).put('/sidebar/sections', {
      sections: [
        { id: favoritesSection, items: [] },
        {
          id: work,
          items: [
            { kind: 'board', id: design },
            { kind: 'view', id: urgent }
          ]
        }
      ]
    })

    expect(await favorites()).toEqual({ boards: [design], views: [urgent] })
    await api.as(owner).delete(`/boards/${design}/favorite`)
    await api.as(owner).delete(`/filters/${urgent}/favorite`)
    expect((await sectionsOf(owner))[1]).toEqual(custom(work, 'Work'))
  })

  it('lets a deleted view leave the sections it was in', async () => {
    const owner = aUser()
    const urgent = await aViewOf(owner, 'Urgent')
    const work = await aSectionOf(owner, 'Work')
    await api.as(owner).put('/sidebar/sections', {
      sections: [
        { id: await favoritesOf(owner), items: [] },
        { id: work, items: [{ kind: 'view', id: urgent }] }
      ]
    })

    await api.as(owner).delete(`/filters/${urgent}`)

    expect((await sectionsOf(owner))[1]).toEqual(custom(work, 'Work'))
  })
})
