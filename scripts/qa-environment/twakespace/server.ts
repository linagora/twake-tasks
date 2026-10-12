// A stand-in for TwakeSpace, enough to try the embedded pages by hand: it
// frames a project and its overlay the way TwakeSpace does (@linagora/twake-embed),
// owns the browser history, and lists what the app tells it.
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'

const APP_ORIGIN = process.env.APP_ORIGIN ?? 'http://localhost:3000'
const FRAME = 'twake-embed-tasks'

interface Space {
  name: string
  projectId: string
}

// Written by start.sh once the seeded spaces are provisioned
function seededSpaces(): Space[] {
  try {
    return JSON.parse(readFileSync('/space.json', 'utf8')) as Space[]
  } catch {
    return []
  }
}

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] ?? c
  )

const style = `
  body { margin: 0; font: 14px system-ui, sans-serif; display: grid; grid-template-rows: auto 1fr auto; height: 100vh }
  header { display: flex; gap: 12px; align-items: center; padding: 8px 12px; background: #1d2a4d; color: white }
  header a { color: white }
  main { position: relative }
  iframe[name="${FRAME}"] { border: 0; width: 100%; height: 100% }
  iframe[name="${FRAME}:overlay"] { position: fixed; inset: 0; width: 100%; height: 100%; border: 0; z-index: 10; background: transparent }
  #log { max-height: 25vh; overflow: auto; margin: 0; padding: 8px 12px; background: #f3f3f3; border-top: 1px solid #ccc; font-size: 12px }
`

function home() {
  const spaces = seededSpaces()
    .map(
      s =>
        `<li><a href="/space/${encodeURIComponent(s.projectId)}">${escape(s.name)}</a> (project ${escape(s.projectId)})</li>`
    )
    .join('')
  return `<!doctype html><meta charset="utf-8"><title>TwakeSpace stand-in</title>
    <style>body { font: 14px system-ui, sans-serif; margin: 24px }</style>
    <h1>TwakeSpace stand-in</h1>
    <p>Frames <code>${escape(APP_ORIGIN)}/embed/projects/&lt;project id&gt;</code> as TwakeSpace does.</p>
    <h2>Spaces</h2>
    <ul>${spaces || '<li>No seeded space</li>'}</ul>
    <form onsubmit="location.href = '/space/' + encodeURIComponent(this.project.value); return false">
      <label>Another project id <input name="project" required></label>
      <button>Open</button>
    </form>`
}

function space(resourceId: string, path: string) {
  const config = JSON.stringify({ appOrigin: APP_ORIGIN, resourceId, path })
  return `<!doctype html><meta charset="utf-8"><title>TwakeSpace stand-in</title>
    <style>${style}</style>
    <header>
      <a href="/">TwakeSpace stand-in</a>
      <span>Project <code id="resource"></code></span>
      <form id="load">
        <label>Load another project <input name="project" required></label>
        <button>Load</button>
      </form>
    </header>
    <main><iframe name="${FRAME}" title="Tasks" allow="fullscreen"></iframe></main>
    <iframe name="${FRAME}:overlay" title="Tasks overlay"></iframe>
    <pre id="log" aria-label="Messages from the app" aria-live="polite"></pre>
    <script type="module">
      const { appOrigin, resourceId, path } = ${config}
      const frame = document.querySelector('iframe[name="${FRAME}"]')
      const overlay = document.querySelector('iframe[name="${FRAME}:overlay"]')
      const log = document.getElementById('log')
      let current = resourceId
      document.getElementById('resource').textContent = current

      const embedUrl = (id, rest) => appOrigin + '/embed/projects/' + encodeURIComponent(id) + rest
      const hereUrl = (id, rest) => '/space/' + encodeURIComponent(id) + (rest ? '?path=' + encodeURIComponent(rest) : '')
      const tell = message => frame.contentWindow.postMessage(message, appOrigin)
      const note = (text) => { log.textContent = new Date().toLocaleTimeString() + ' ' + text + '\\n' + log.textContent }

      // Nothing of the overlay shows until the app reports what it draws
      const clip = region => {
        if (region === 'full') return 'none'
        if (!Array.isArray(region) || region.length === 0) return 'inset(0 0 100% 0)'
        return "path('" + region.map(b => 'M' + b.x + ' ' + b.y + 'h' + b.width + 'v' + b.height + 'h' + -b.width + 'Z').join(' ') + "')"
      }
      overlay.style.clipPath = clip(null)

      history.replaceState({ resourceId, path }, '', hereUrl(resourceId, path))
      frame.addEventListener('load', () => tell({ type: 'twake-embed:hello' }))
      overlay.src = appOrigin + '/embed/overlay.html'
      frame.src = embedUrl(resourceId, path)

      addEventListener('message', event => {
        if (event.origin !== appOrigin || event.source !== frame.contentWindow) return
        const data = event.data ?? {}
        switch (data.type) {
          case 'twake-embed:ready':
            tell({ type: 'twake-embed:hello' })
            break
          case 'twake-embed:overlay-region':
            overlay.style.clipPath = clip(data.region)
            return
          case 'twake-embed:path': {
            current = data.resourceId
            document.getElementById('resource').textContent = current
            const state = { resourceId: data.resourceId, path: data.path }
            const url = hereUrl(data.resourceId, data.path)
            if (data.replace) history.replaceState(state, '', url)
            else history.pushState(state, '', url)
            break
          }
          case 'twake-embed:fill-page':
            frame.parentElement.style.position = data.fill ? 'fixed' : 'relative'
            frame.parentElement.style.inset = data.fill ? '0' : ''
            frame.parentElement.style.zIndex = data.fill ? '5' : ''
            break
        }
        note(JSON.stringify(data))
      })

      addEventListener('popstate', event => {
        const state = event.state
        if (!state) return
        if (state.resourceId === current) tell({ type: 'twake-embed:navigate', resourceId: state.resourceId, path: state.path })
        else tell({ type: 'twake-embed:load', resourceId: state.resourceId, path: state.path })
        current = state.resourceId
        document.getElementById('resource').textContent = current
      })

      document.getElementById('load').addEventListener('submit', event => {
        event.preventDefault()
        tell({ type: 'twake-embed:load', resourceId: event.target.project.value, path: '' })
      })
    </script>`
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://twakespace')
  const match = /^\/space\/([^/]+)$/.exec(url.pathname)
  res.setHeader('content-type', 'text/html; charset=utf-8')
  if (url.pathname === '/') {
    res.end(home())
  } else if (match?.[1]) {
    res.end(
      space(decodeURIComponent(match[1]), url.searchParams.get('path') ?? '')
    )
  } else {
    res.writeHead(404)
    res.end('Not found')
  }
}).listen(8080, () => {
  console.log(`TwakeSpace stand-in framing ${APP_ORIGIN}`)
})
