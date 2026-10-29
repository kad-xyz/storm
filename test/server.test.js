import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createStorm } from '../server/storm.js'
import { AUTH } from './fixtures.js'

let dir, server, storm, base

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storm-'))
  fs.writeFileSync(path.join(dir, 'auth.md'), AUTH)
  storm = createStorm({ boardsDir: dir })
  server = http.createServer((req, res) => storm.middleware(req, res, () => { res.statusCode = 404; res.end() }))
  await new Promise((r) => server.listen(0, r))
  base = `http://127.0.0.1:${server.address().port}`
})

afterEach(async () => {
  storm.close()
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
  fs.rmSync(dir, { recursive: true, force: true })
})

function sse() {
  const events = []
  const ctrl = new AbortController()
  const ready = fetch(`${base}/api/events`, { signal: ctrl.signal }).then(async (res) => {
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    ;(async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buf += dec.decode(value)
          let i
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, i); buf = buf.slice(i + 2)
            const data = chunk.split('\n').find((l) => l.startsWith('data: '))
            if (data && chunk.includes('event: board')) events.push(JSON.parse(data.slice(6)))
          }
        }
      } catch {}
    })()
  })
  return { events, ready, stop: () => ctrl.abort() }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

describe('storm api', () => {
  it('lists boards', async () => {
    const res = await fetch(`${base}/api/boards`)
    expect(await res.json()).toEqual([{ slug: 'auth', title: 'Авторизация по паролю' }])
  })

  it('gets a board with extras', async () => {
    const res = await fetch(`${base}/api/boards/auth`)
    expect(await res.json()).toEqual({ text: AUTH, extras: [] })
  })

  it('ops patch file on disk', async () => {
    const res = await fetch(`${base}/api/boards/auth/ops`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: 'c1', ops: [{ op: 'delete', id: 'h1' }] }),
    })
    const body = await res.json()
    expect(body.text).not.toContain('@h1')
    expect(fs.readFileSync(path.join(dir, 'auth.md'), 'utf8')).toBe(body.text)
  })

  it('external edit emits sse with origin file', async () => {
    const s = sse(); await s.ready; await wait(100)
    fs.writeFileSync(path.join(dir, 'auth.md'), AUTH + 'event Новое\n')
    const t0 = Date.now()
    while (!s.events.length && Date.now() - t0 < 1000) await wait(20)
    s.stop()
    expect(s.events[0]).toMatchObject({ slug: 'auth', origin: 'file' })
    expect(s.events[0].text).toContain('event Новое')
  })

  it('own write suppressed', async () => {
    const s = sse(); await s.ready; await wait(100)
    await fetch(`${base}/api/boards/auth/ops`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: 'c1', ops: [{ op: 'edit', id: 'a1', text: 'Ок' }] }),
    })
    await wait(400)
    s.stop()
    expect(s.events.map((e) => e.origin)).toEqual(['c1'])
  })

  it('puts extras', async () => {
    await fetch(`${base}/api/boards/auth/extras`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ extras: [{ id: 'x', type: 'arrow' }] }),
    })
    const res = await fetch(`${base}/api/boards/auth`)
    expect((await res.json()).extras).toEqual([{ id: 'x', type: 'arrow' }])
  })

  it('missing board 404', async () => {
    expect((await fetch(`${base}/api/boards/nope`)).status).toBe(404)
  })

  it('bad slug 400', async () => {
    expect((await fetch(`${base}/api/boards/..%2Fetc`)).status).toBe(400)
  })
})
