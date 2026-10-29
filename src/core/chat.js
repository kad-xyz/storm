// Side chat next to a board: `boards/<slug>.chat.md`, one message per line.
//   agent: text [→id]                     comment, optionally about a sticker
//   ask @q1: question [→id] [A | B | C]   question with answer buttons
//   user: text                            note from the person
//   answer @q1: B                         written by the server when a button is pressed

const LINE_RE = /^(agent|user|ask|answer)(?:\s+@(\S+))?\s*:\s*(.*)$/

function splitRef(text) {
  const m = /\s+→(\S+)\s*$/.exec(text)
  return m ? { text: text.slice(0, m.index).trim(), ref: m[1] } : { text: text.trim(), ref: null }
}

export function parseChat(text) {
  const msgs = []
  const answers = new Map()
  for (const line of (text ?? '').split('\n')) {
    const m = LINE_RE.exec(line.trim())
    if (!m) continue
    const [, kind, id, body] = m
    if (kind === 'answer') { if (id) answers.set(id, body.trim()); continue }
    if (kind === 'ask') {
      const opts = /\s*\[([^\]]*)\]\s*$/.exec(body)
      const rest = opts ? body.slice(0, opts.index) : body
      const options = opts ? opts[1].split('|').map((o) => o.trim()).filter(Boolean) : []
      msgs.push({ kind, id: id ?? null, ...splitRef(rest), options, answer: null })
      continue
    }
    msgs.push(kind === 'agent' ? { kind, ...splitRef(body) } : { kind, text: body.trim() })
  }
  for (const msg of msgs) if (msg.kind === 'ask' && answers.has(msg.id)) msg.answer = answers.get(msg.id)
  return msgs
}

// The line to append when `option` is chosen for question `id`, or null if there is no such choice.
export function answerLine(text, id, option) {
  const ask = parseChat(text).find((m) => m.kind === 'ask' && m.id === id)
  return ask && ask.options.includes(option) ? `answer @${id}: ${option}` : null
}

// The agent's final reply -> chat lines. Chat-format agent/ask lines pass through, plain text is grouped
// by paragraph into agent lines; anything that looks like the person's own line is wrapped.
export function replyToLines(reply) {
  const out = []
  let para = []
  const flush = () => {
    if (para.length) out.push(`agent: ${para.join(' ')}`)
    para = []
  }
  for (const raw of (reply ?? '').split('\n')) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    if (/^(agent|ask)(\s+@\S+)?\s*:/.test(line)) { flush(); out.push(line); continue }
    if (/^(user|answer)(\s+@\S+)?\s*:/.test(line)) { flush(); out.push(`agent: ${line}`); continue }
    para.push(line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^(#+|[-*]|\d+\.)\s+/, ''))
  }
  flush()
  return out
}
