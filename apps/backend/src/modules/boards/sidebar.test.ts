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
    sections: { id: string; name: string; items: object[] }[]
  }>().sections

describe('sidebar sections', () => {
  it('keeps my sections, in their order, with the boards and views I put in them, each in one only', async () => {
    const owner = aUser()
    const other = aUser({ organizationId: owner.organizationId })
    const design = await aBoardOf(owner, 'DES')
    const urgent = await aViewOf(owner, 'Urgent')
    const work = await aSectionOf(owner, 'Work')
    const home = await aSectionOf(owner, 'Home')

    const saved = await api.as(owner).put('/sidebar/sections', {
      sections: [
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
      {
        id: home,
        name: 'Home',
        items: [
          { kind: 'view', id: urgent },
          { kind: 'board', id: design }
        ]
      },
      { id: work, name: 'Work', items: [] }
    ])
    expect(await sectionsOf(other)).toEqual([])
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
      'Job'
    ])
    expect(
      (await api.as(other).delete(`/sidebar/sections/${work}`)).statusCode
    ).toBe(404)
    expect(
      (await api.as(owner).delete(`/sidebar/sections/${work}`)).statusCode
    ).toBe(204)
    expect(await sectionsOf(owner)).toEqual([])
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

    const layout = (items: object[]) => ({
      sections: [{ id: work, items }]
    })
    expect(
      (await api.as(owner).put('/sidebar/sections', layout([]))).statusCode
    ).toBe(409)
    const home = (await sectionsOf(owner))[1]?.id ?? ''
    const both = (items: object[]) => ({
      sections: [
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
    expect(await sectionsOf(owner)).toEqual([
      { id: work, name: 'Work', items: [] }
    ])
  })

  it('lets a deleted view leave the sections it was in', async () => {
    const owner = aUser()
    const urgent = await aViewOf(owner, 'Urgent')
    const work = await aSectionOf(owner, 'Work')
    await api.as(owner).put('/sidebar/sections', {
      sections: [{ id: work, items: [{ kind: 'view', id: urgent }] }]
    })

    await api.as(owner).delete(`/filters/${urgent}`)

    expect(await sectionsOf(owner)).toEqual([
      { id: work, name: 'Work', items: [] }
    ])
  })
})
