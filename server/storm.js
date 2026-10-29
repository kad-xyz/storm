// Board API over a folder of `<slug>.md` files: REST + server-sent events.
import fs from 'node:fs'
import path from 'node:path'
import { parse, applyOps } from '../src/core/format.js'

const SLUG_RE = /^[\p{L}\p{N}_-][\p{L}\p{N}_.-]*$/u

export function createStorm({ boardsDir }) {
  fs.mkdirSync(boardsDir, { recursive: true })
  const clients = new Set()
  const known = new Map() // slug -> last text seen or written; changes are broadcast only when it differs
  const timers = new Map()

  const file = (slug, ext = '.md') => path.join(boardsDir, slug + ext)
  for (const n of fs.readdirSync(boardsDir)) {
    if (n.endsWith('.md')) known.set(n.slice(0, -3), fs.readFileSync(path.join(boardsDir, n), 'utf8'))
  }
  const broadcast = (payload) => {
    const msg = `event: board\ndata: ${JSON.stringify(payload)}\n\n`
    clients.forEach((res) => res.write(msg))
  }

  const watcher = fs.watch(boardsDir, (_, name) => {
    if (!name || !name.endsWith('.md')) return
    const slug = name.slice(0, -3)
    clearTimeout(timers.get(slug))
    timers.set(slug, setTimeout(() => {
      timers.delete(slug)
      let text
      try { text = fs.readFileSync(file(slug), 'utf8') } catch { text = null }
      if (text === (known.get(slug) ?? null)) return
      if (text === null) known.delete(slug)
      else known.set(slug, text)
      broadcast({ slug, text, origin: 'file' })
    }, 50))
  })

  const json = (res, status, body) => {
    res.statusCode = status
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(body))
  }
  const readBody = (req) => new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 1e6) req.destroy(new Error('body too large'))
    })
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')) } catch (e) { reject(e) } })
    req.on('error', reject)
  })
  const readExtras = (slug) => {
    try { return JSON.parse(fs.readFileSync(file(slug, '.layout.json'), 'utf8')).extras ?? [] } catch { return [] }
  }

  async function middleware(req, res, next) {
    const url = new URL(req.url, 'http://x')
    if (!url.pathname.startsWith('/api/')) return next()
    // Only this page may write: other sites could otherwise post "simple" requests to localhost.
    if (req.method !== 'GET') {
      const origin = req.headers.origin
      if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'foreign origin' })
      if (!/^application\/json\b/.test(req.headers['content-type'] ?? '')) return json(res, 415, { error: 'json only' })
    }
    try {
      if (url.pathname === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
        res.write(': hi\n\n')
        clients.add(res)
        req.on('close', () => clients.delete(res))
        return
      }
      if (url.pathname === '/api/boards' && req.method === 'GET') {
        const list = fs.readdirSync(boardsDir).filter((n) => n.endsWith('.md')).sort().map((n) => {
          const slug = n.slice(0, -3)
          return { slug, title: parse(fs.readFileSync(file(slug), 'utf8')).title || slug }
        })
        return json(res, 200, list)
      }
      const m = /^\/api\/boards\/([^/]+)(?:\/(ops|extras))?$/.exec(url.pathname)
      if (!m) return json(res, 404, { error: 'not found' })
      const slug = decodeURIComponent(m[1])
      if (!SLUG_RE.test(slug) || slug.includes('..')) return json(res, 400, { error: 'bad slug' })
      if (!fs.existsSync(file(slug))) return json(res, 404, { error: 'board not found' })

      if (!m[2] && req.method === 'GET') {
        return json(res, 200, { text: fs.readFileSync(file(slug), 'utf8'), extras: readExtras(slug) })
      }
      if (m[2] === 'ops' && req.method === 'POST') {
        const { ops = [], clientId = 'page', base } = await readBody(req)
        const current = fs.readFileSync(file(slug), 'utf8')
        const { text, assigned } = applyOps(current, ops, base ?? current)
        if (text !== current) {
          known.set(slug, text)
          fs.writeFileSync(file(slug), text)
          broadcast({ slug, text, origin: clientId })
        }
        return json(res, 200, { text, assigned })
      }
      if (m[2] === 'extras' && req.method === 'PUT') {
        const { extras = [] } = await readBody(req)
        fs.writeFileSync(file(slug, '.layout.json'), JSON.stringify({ extras }, null, 1))
        return json(res, 200, { ok: true })
      }
      return json(res, 405, { error: 'method not allowed' })
    } catch (e) {
      return json(res, 500, { error: String(e.message ?? e) })
    }
  }

  return {
    middleware,
    close() {
      watcher.close()
      timers.forEach(clearTimeout)
      clients.forEach((res) => res.end())
    },
  }
}

export function stormPlugin({ boardsDir } = {}) {
  return {
    name: 'storm',
    configureServer(server) {
      if (process.env.VITEST) return
      const storm = createStorm({ boardsDir: boardsDir ?? path.join(server.config.root, 'boards') })
      server.middlewares.use(storm.middleware)
      server.httpServer?.on('close', storm.close)
    },
  }
}
