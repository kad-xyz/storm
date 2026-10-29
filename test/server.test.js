import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createStorm } from '../server/storm.js'
import { AUTH } from './fixtures.js'

let dir, server, storm, base

// One HTTP server for the file: a fresh port per test lets fetch reuse a stale keep-alive socket.
beforeAll(async () => {
  server = http.createServer((req, res) => storm.middleware(req, res, () => { res.statusCode = 404; res.end() }))
  await new Promise((r) => server.listen(0, r))
  base = `http://127.0.0.1:${server.address().port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
})

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storm-'))
  fs.writeFileSync(path.join(dir, 'auth.md'), AUTH)
  // Never start a real agent from tests.
  storm = createStorm({ boardsDir: dir, runAgent: async () => '' })
})

afterEach(() => {
  storm.close()
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
            const type = chunk.split('\n').find((l) => l.startsWith('event: '))?.slice(7)
            if (data && type) events.push({ type, ...JSON.parse(data.slice(6)) })
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
    expect(await res.json()).toEqual({ text: AUTH, extras: [], chat: '', agent: { state: 'idle', label: null } })
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

describe('storm api hardening', () => {
  it('rejects ops without json content type', async () => {
    const res = await fetch(`${base}/api/boards/auth/ops`, {
      method: 'POST', headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ ops: [{ op: 'delete', id: 'h1' }] }),
    })
    expect(res.status).toBe(415)
    expect(fs.readFileSync(path.join(dir, 'auth.md'), 'utf8')).toBe(AUTH)
  })

  it('rejects requests from another origin', async () => {
    const res = await fetch(`${base}/api/boards/auth/ops`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ ops: [{ op: 'delete', id: 'h1' }] }),
    })
    expect(res.status).toBe(403)
  })

  it('ops are rebased when sent with a stale base', async () => {
    const current = AUTH.replace('## flow\n', '## flow\nactor Новый\n')
    fs.writeFileSync(path.join(dir, 'auth.md'), current)
    const cmdLine = AUTH.split('\n').findIndex((l) => l.startsWith('command'))
    const res = await fetch(`${base}/api/boards/auth/ops`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ base: AUTH, ops: [{ op: 'edit', id: `L${cmdLine}`, text: 'Войти' }] }),
    })
    const { text } = await res.json()
    expect(text).toContain('actor Новый')
    expect(text).toMatch(/command Войти +@s1/)
  })
})

describe('storm chat', () => {
  const post = (url, body) => fetch(`${base}${url}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })

  it('chat file is not listed as a board', async () => {
    fs.writeFileSync(path.join(dir, 'auth.chat.md'), 'agent: привет\n')
    expect((await (await fetch(`${base}/api/boards`)).json()).map((b) => b.slug)).toEqual(['auth'])
    expect((await fetch(`${base}/api/boards/auth.chat`)).status).toBe(400)
  })

  it('board comes with its chat', async () => {
    fs.writeFileSync(path.join(dir, 'auth.chat.md'), 'agent: привет\n')
    expect((await (await fetch(`${base}/api/boards/auth`)).json()).chat).toBe('agent: привет\n')
  })

  it('answer appends a line to the chat file', async () => {
    fs.writeFileSync(path.join(dir, 'auth.chat.md'), 'ask @q1: Дальше? [Да | Нет]')
    const res = await post('/api/boards/auth/answer', { id: 'q1', option: 'Да' })
    expect(res.status).toBe(200)
    expect(fs.readFileSync(path.join(dir, 'auth.chat.md'), 'utf8')).toBe('ask @q1: Дальше? [Да | Нет]\nanswer @q1: Да\n')
  })

  it('answer to unknown option is rejected', async () => {
    fs.writeFileSync(path.join(dir, 'auth.chat.md'), 'ask @q1: Дальше? [Да | Нет]\n')
    expect((await post('/api/boards/auth/answer', { id: 'q1', option: 'Может' })).status).toBe(400)
  })

  it('external chat edit emits chat event, not board', async () => {
    const s = sse(); await s.ready; await wait(100)
    fs.writeFileSync(path.join(dir, 'auth.chat.md'), 'agent: новое\n')
    const t0 = Date.now()
    while (!s.events.length && Date.now() - t0 < 1000) await wait(20)
    await wait(150)
    s.stop()
    expect(s.events).toEqual([{ type: 'chat', slug: 'auth', chat: 'agent: новое\n' }])
  })
})

describe('storm agent', () => {
  let calls, replies, agentStorm, agentServer, agentBase
  const fakeRun = (opts) => {
    calls.push(opts)
    const r = replies.shift() ?? { text: 'agent: ок' }
    return new Promise((resolve, reject) => setTimeout(() => {
      opts.onTool?.('читает main.go')
      setTimeout(() => (r.error ? reject(new Error(r.error)) : resolve(r.text)), 30)
    }, 30))
  }
  const say = (text) => fetch(`${agentBase}/api/boards/auth/say`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }),
  })
  const chatFile = () => fs.readFileSync(path.join(dir, 'auth.chat.md'), 'utf8')
  const idle = async () => {
    const t0 = Date.now()
    await wait(20)
    while (agentStorm.agentState('auth').state !== 'idle' && Date.now() - t0 < 3000) await wait(20)
  }

  beforeEach(async () => {
    calls = []; replies = []
    agentStorm = createStorm({ boardsDir: dir, runAgent: fakeRun })
    agentServer = http.createServer((req, res) => agentStorm.middleware(req, res, () => { res.statusCode = 404; res.end() }))
    await new Promise((r) => agentServer.listen(0, r))
    agentBase = `http://127.0.0.1:${agentServer.address().port}`
  })

  afterEach(async () => {
    agentStorm.close()
    agentServer.closeAllConnections()
    await new Promise((r) => agentServer.close(r))
  })

  it('say appends the user line, runs the agent and appends its reply', async () => {
    replies.push({ text: 'Смотрю.\nagent: Тут два пути →a1' })
    expect((await say('посмотри оплату')).status).toBe(200)
    await idle()
    expect(chatFile()).toBe('user: посмотри оплату\nagent: Смотрю.\nagent: Тут два пути →a1\n')
    expect(calls[0].prompt).toContain('посмотри оплату')
    expect(calls[0].systemPrompt).toContain(path.join(dir, 'auth.md'))
    expect(calls[0].allowedTools).toContain(`Edit(/${path.join(dir, 'auth.md')})`)
  })

  it('messages sent while busy go in one batch', async () => {
    await say('раз')
    await wait(10)
    await say('два')
    await say('три')
    await idle()
    expect(calls).toHaveLength(2)
    expect(calls[1].prompt).toContain('два')
    expect(calls[1].prompt).toContain('три')
  })

  it('reports thinking, tool and idle states', async () => {
    const seen = []
    const orig = agentStorm.agentState
    await say('привет')
    const t0 = Date.now()
    while (Date.now() - t0 < 1000) {
      const s = orig('auth')
      if (!seen.length || seen[seen.length - 1] !== s.state + ':' + (s.label ?? '')) seen.push(s.state + ':' + (s.label ?? ''))
      if (s.state === 'idle' && seen.length > 1) break
      await wait(5)
    }
    expect(seen).toEqual(['thinking:', 'thinking:читает main.go', 'idle:'])
  })

  it('agent failure is reported in the chat', async () => {
    replies.push({ error: 'boom' })
    await say('привет')
    await idle()
    expect(chatFile()).toContain('agent: ⚠️ Агент не ответил: boom')
  })

  it('answer button tells the agent', async () => {
    fs.writeFileSync(path.join(dir, 'auth.chat.md'), 'ask @q1: Дальше? [Да | Нет]\n')
    await fetch(`${agentBase}/api/boards/auth/answer`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'q1', option: 'Да' }),
    })
    await idle()
    expect(calls[0].prompt).toContain('Дальше?')
    expect(calls[0].prompt).toContain('Да')
  })

  it('one session per board: created once, then resumed', async () => {
    await say('раз'); await idle()
    await say('два'); await idle()
    expect(calls[0].resume).toBe(false)
    expect(calls[1].resume).toBe(true)
    expect(calls[1].sessionId).toBe(calls[0].sessionId)
    expect(fs.readFileSync(path.join(dir, 'auth.session'), 'utf8').trim()).toBe(calls[0].sessionId)
  })

  it('repo and model come from the board header', async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-'))
    fs.writeFileSync(path.join(dir, 'auth.md'), AUTH.replace('phase: 2', `phase: 2\nrepo: ${repo}\nmodel: haiku`))
    await say('привет'); await idle()
    expect(calls[0].cwd).toBe(repo)
    expect(calls[0].model).toBe('haiku')
    fs.rmSync(repo, { recursive: true, force: true })
  })

  it('without repo the agent runs in the boards folder with sonnet', async () => {
    await say('привет'); await idle()
    expect(calls[0].cwd).toBe(dir)
    expect(calls[0].model).toBe('sonnet')
  })
})
