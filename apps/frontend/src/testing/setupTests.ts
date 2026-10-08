import '@testing-library/jest-dom/vitest'

import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// The first render of a file loads the whole app, which takes over the default
// second on a busy machine.
configure({ reactStrictMode: true, asyncUtilTimeout: 3000 })

afterEach(cleanup)

// jsdom does no layout. ProseMirror measures the caret to scroll it into view,
// and a suggestion list scrolls its active option into view.
const noRects = (): DOMRectList =>
  Object.assign([] as DOMRect[], { item: () => null })
Range.prototype.getClientRects = noRects
Range.prototype.getBoundingClientRect = () => ({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  toJSON: () => ({})
})
Element.prototype.scrollIntoView = () => undefined
