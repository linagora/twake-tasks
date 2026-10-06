import { readFileSync } from 'node:fs'

import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as { version: string }

export default defineConfig({
  plugins: [pluginReact()],
  html: {
    template: './index.html'
  },
  source: {
    entry: { index: './src/index.tsx' },
    define: { __APP_VERSION__: JSON.stringify(version) }
  },
  resolve: {
    alias: { '@': './src' }
  },
  server: {
    port: Number(process.env.PORT ?? 3000),
    historyApiFallback: true,
    proxy: { '/api': process.env.API_UPSTREAM ?? 'http://localhost:8080' }
  },
  output: {
    sourceMap: { js: false }
  }
})
