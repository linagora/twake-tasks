import '@testing-library/jest-dom/vitest'

import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

configure({ reactStrictMode: true })

afterEach(cleanup)
