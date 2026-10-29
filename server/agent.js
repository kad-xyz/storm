// One headless agent session per board; messages that arrive while it works are sent as one batch.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { parse } from '../src/core/format.js'
import { parseChat, replyToLines } from '../src/core/chat.js'

const PROMPT = fs.readFileSync(new URL('./agent-prompt.md', import.meta.url), 'utf8')
const GITLAB = path.join(os.homedir(), '.claude/skills/gitlab-mr-comments/gitlab_mr.py')
const TRACKER_READ = ['issue_get', 'issue_get_comments', 'issues_find', 'issue_get_links', 'issue_get_checklist']

const expand = (p) => (p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p)

export function allowedTools(boardPath) {
  return [
    'Read', 'Grep', 'Glob',
    `Edit(/${boardPath})`,
    ...['info', 'diff', 'notes'].flatMap((c) => [`Bash(python3 ${GITLAB} ${c}:*)`, `Bash(python3 ~/.claude/skills/gitlab-mr-comments/gitlab_mr.py ${c}:*)`]),
    ...['log', 'show', 'diff', 'blame'].map((c) => `Bash(git ${c}:*)`),
    ...TRACKER_READ.map((t) => `mcp__yandex-tracker__${t}`),
  ]
}

export function createAgents({ boardsDir, runAgent, appendChat, readChat, onState }) {
  const queues = new Map() // slug -> pending messages
  const states = new Map() // slug -> { state, label }

  const setState = (slug, state, label = null) => {
    states.set(slug, { state, label })
    onState(slug, { state, label })
  }
  const sessionFile = (slug) => path.join(boardsDir, `${slug}.session`)

  async function drain(slug) {
    const batch = queues.get(slug)
    if (!batch?.length || states.get(slug)?.state === 'thinking') return
    queues.set(slug, [])
    setState(slug, 'thinking')
    const boardPath = path.join(boardsDir, `${slug}.md`)
    const { meta } = parse(fs.readFileSync(boardPath, 'utf8'))
    const repo = meta.repo && fs.existsSync(expand(meta.repo)) ? expand(meta.repo) : null
    let sessionId = null
    try { sessionId = fs.readFileSync(sessionFile(slug), 'utf8').trim() || null } catch {}
    const resume = Boolean(sessionId)
    sessionId ??= randomUUID()
    const asked = parseChat(readChat(slug)).filter((m) => m.kind === 'ask').map((m) => m.id)
    const prompt = [
      'Сообщения из панели доски:',
      ...batch.map((m) => `- ${m}`),
      asked.length ? `\n(уже занятые id вопросов: ${asked.join(', ')})` : '',
    ].join('\n')
    try {
      const reply = await runAgent({
        prompt,
        systemPrompt: PROMPT.replace('{{BOARD}}', boardPath).replace('{{REPO}}', repo ?? 'не указан (строка `repo:` в шапке доски)'),
        sessionId, resume,
        cwd: repo ?? boardsDir,
        addDirs: repo ? [boardsDir] : [],
        model: meta.model ?? 'sonnet',
        allowedTools: allowedTools(boardPath),
        onTool: (label) => setState(slug, 'thinking', label),
      })
      if (!resume) fs.writeFileSync(sessionFile(slug), sessionId + '\n')
      appendChat(slug, replyToLines(reply))
    } catch (e) {
      appendChat(slug, [`agent: ⚠️ Агент не ответил: ${String(e.message ?? e).split('\n')[0]}`])
    }
    setState(slug, 'idle')
    drain(slug)
  }

  return {
    say(slug, message) {
      if (!queues.has(slug)) queues.set(slug, [])
      queues.get(slug).push(message)
      drain(slug)
    },
    state: (slug) => states.get(slug) ?? { state: 'idle', label: null },
  }
}
