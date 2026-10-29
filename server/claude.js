// Runs one turn of a headless Claude Code session and reports tool use as it goes.
import { spawn } from 'node:child_process'

const label = (name, input = {}) => {
  const file = (input.file_path ?? input.path ?? '').split('/').slice(-2).join('/')
  if (name === 'Read') return `читает ${file}`
  if (name === 'Edit') return 'правит доску'
  if (name === 'Grep' || name === 'Glob') return `ищет ${input.pattern ?? ''}`.trim()
  if (name === 'Bash') return 'смотрит МР / git'
  if (name.startsWith('mcp__yandex-tracker')) return 'читает задачу в Трекере'
  return name
}

export function runClaude({ prompt, systemPrompt, sessionId, resume, cwd, addDirs = [], model, allowedTools, onTool }) {
  const args = [
    '-p', prompt,
    '--output-format', 'stream-json', '--verbose',
    '--model', model,
    resume ? '--resume' : '--session-id', sessionId,
    '--append-system-prompt', systemPrompt,
    // User settings carry broad allow rules and plugins; the board agent gets only what is listed here.
    '--setting-sources', 'project',
    '--allowedTools', ...allowedTools,
    '--disallowedTools', 'Write', 'NotebookEdit',
    ...addDirs.flatMap((d) => ['--add-dir', d]),
  ]
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.STORM_CLAUDE ?? 'claude', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let buf = ''
    let result = null
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      buf += chunk
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1)
        let e
        try { e = JSON.parse(line) } catch { continue }
        if (e.type === 'assistant') {
          for (const c of e.message?.content ?? []) if (c.type === 'tool_use') onTool?.(label(c.name, c.input))
        }
        if (e.type === 'result') result = e
      }
    })
    child.stderr.on('data', (c) => (stderr += c))
    child.on('error', reject)
    child.on('close', (code) => {
      if (result && !result.is_error) resolve(result.result ?? '')
      else reject(new Error(result?.result || stderr.trim().split('\n').pop() || `claude exited with ${code}`))
    })
  })
}
