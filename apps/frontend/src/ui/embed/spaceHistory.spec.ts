import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance
} from 'vitest'

import {
  installSpaceHistory,
  isValidEmbedPath,
  isValidResourceId,
  parseEmbedUrl,
  suppress
} from '@/ui/embed/spaceHistory'

const SPACE = 'https://space.example.com'

describe('parseEmbedUrl', () => {
  it('splits the project id from what lies below the embed route', () => {
    expect(parseEmbedUrl('/embed/projects/p1')).toEqual({
      resourceId: 'p1',
      path: ''
    })
    expect(
      parseEmbedUrl('/embed/projects/p1/boards/b1', '?task=1', '#x')
    ).toEqual({ resourceId: 'p1', path: '/boards/b1?task=1#x' })
    expect(parseEmbedUrl('/embed/projects/p1', '?q=1')).toEqual({
      resourceId: 'p1',
      path: '?q=1'
    })
  })

  it('knows no project outside the embed route', () => {
    expect(parseEmbedUrl('/boards')).toBeNull()
    expect(parseEmbedUrl('/embed/projects/')).toBeNull()
  })
})

describe('isValidEmbedPath', () => {
  it.each(['', '/boards/b1', '?task=1', '#x', '/boards?next=http://a//b'])(
    'accepts %j',
    path => {
      expect(isValidEmbedPath(path)).toBe(true)
    }
  )

  it.each([
    'boards',
    '//evil.test',
    '/a//b',
    '/../x',
    '/a/..',
    '/a\\b',
    1,
    null
  ])('rejects %j', path => {
    expect(isValidEmbedPath(path)).toBe(false)
  })
})

describe('isValidResourceId', () => {
  it('only accepts an id that cannot leave its segment', () => {
    expect(isValidResourceId('abc-123')).toBe(true)
    expect(isValidResourceId('')).toBe(false)
    expect(isValidResourceId('..')).toBe(false)
    expect(isValidResourceId('a/b')).toBe(false)
    expect(isValidResourceId(3)).toBe(false)
  })
})

describe('installSpaceHistory', () => {
  let uninstall: () => void
  let post: MockInstance<Window['postMessage']>

  beforeEach(() => {
    window.TWAKE_SPACE_ORIGIN = SPACE
    post = vi.spyOn(window.parent, 'postMessage')
  })

  afterEach(() => {
    uninstall()
    delete window.TWAKE_SPACE_ORIGIN
    window.history.replaceState(null, '', '/')
    vi.restoreAllMocks()
  })

  it('leaves the history alone outside the embed route', () => {
    window.history.replaceState(null, '', '/boards')
    uninstall = installSpaceHistory()

    expect(Object.hasOwn(window.history, 'pushState')).toBe(false)
  })

  describe('in the embed route', () => {
    beforeEach(() => {
      window.history.replaceState(null, '', '/embed/projects/p1')
      uninstall = installSpaceHistory()
    })

    it('turns a push into a replace and reports it', () => {
      const length = window.history.length
      window.history.pushState(null, '', '/embed/projects/p1/boards/b1?a=1#h')

      expect(window.history.length).toBe(length)
      expect(window.location.pathname).toBe('/embed/projects/p1/boards/b1')
      expect(post).toHaveBeenCalledWith(
        {
          type: 'twake-embed:path',
          resourceId: 'p1',
          path: '/boards/b1?a=1#h',
          replace: false
        },
        SPACE
      )
    })

    it('reports a replace as such', () => {
      window.history.replaceState(null, '', '/embed/projects/p1?q=1')

      expect(post).toHaveBeenCalledWith(
        {
          type: 'twake-embed:path',
          resourceId: 'p1',
          path: '?q=1',
          replace: true
        },
        SPACE
      )
    })

    it('reports nothing for what TwakeSpace asked for', async () => {
      await suppress(() => {
        window.history.replaceState(null, '', '/embed/projects/p2')
      })
      expect(post).not.toHaveBeenCalled()

      window.history.replaceState(null, '', '/embed/projects/p2')
      expect(post).toHaveBeenCalledTimes(1)
    })

    it('is installed once', () => {
      expect(installSpaceHistory()).toBe(uninstall)
    })
  })
})
