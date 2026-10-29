// Board file format: one sticker per line, `<type> <text> [@id] [→ref]`.
// See docs/format.md for the cheat sheet.

export const TYPES = ['event', 'command', 'actor', 'policy', 'ui', 'system', 'hot', 'aggregate']
// Types that stand before the event of their column; the rest follow it.
const BEFORE = new Set(['actor', 'command', 'ui', 'system', 'aggregate'])

const ITEM_RE = /^(\s*)([a-z]+)(\s+)(.*?)((?:\s+[@→]\S+)*)\s*$/
const FLOW_RE = /^##\s+flow\b\s*(.*?)\s*(?:←\s*(\S+))?\s*$/

function parseItem(line, index) {
  const m = ITEM_RE.exec(line)
  if (!m || !TYPES.includes(m[2]) || !m[4].trim()) return null
  const tokens = m[5].trim().split(/\s+/).filter(Boolean)
  const id = tokens.find((t) => t.startsWith('@'))?.slice(1) ?? null
  const ref = tokens.find((t) => t.startsWith('→'))?.slice(1) || null
  return { id, type: m[2], text: m[4].trim(), ref, line: index }
}

export function parse(text) {
  const lines = text.split('\n')
  const board = { title: '', phase: null, flows: [], lines }
  const hasFlows = lines.some((l) => FLOW_RE.test(l))
  let flow = hasFlows ? null : { name: null, from: null, headerLine: null, items: [] }
  if (flow) board.flows.push(flow)
  lines.forEach((line, i) => {
    const fm = FLOW_RE.exec(line)
    if (fm) {
      flow = { name: fm[1] || null, from: fm[2] || null, headerLine: i, items: [] }
      board.flows.push(flow)
      return
    }
    if (!flow) {
      const title = /^#\s+(.+)$/.exec(line)
      if (title && !board.title) board.title = title[1].trim()
      const phase = /^phase:\s*(\d+)\s*$/.exec(line)
      if (phase) board.phase = Number(phase[1])
      return
    }
    const item = parseItem(line, i)
    if (item) flow.items.push(item)
  })
  return board
}

export function key(item) {
  return item.id ?? `L${item.line}`
}

export function columns(flow) {
  const cols = []
  let cur = null
  let seenEvent = false
  for (const item of flow.items) {
    const startsNew = !cur || (seenEvent && (BEFORE.has(item.type) || item.type === 'event'))
    if (startsNew) {
      cur = { eventId: null, items: [] }
      cols.push(cur)
      seenEvent = false
    }
    cur.items.push(item)
    if (item.type === 'event') {
      cur.eventId = key(item)
      seenEvent = true
    }
  }
  return cols
}

export function newId(board, taken = new Set()) {
  const used = new Set(taken)
  board.flows.forEach((f) => f.items.forEach((i) => i.id && used.add(i.id)))
  let n = 1
  while (used.has(`s${n}`)) n++
  return `s${n}`
}

function findItem(board, id) {
  for (let f = 0; f < board.flows.length; f++) {
    const item = board.flows[f].items.find((i) => key(i) === id)
    if (item) return { item, flow: f }
  }
  return null
}

// Line range [start, end) occupied by each column, unknown lines stick to the column before them.
function columnRanges(board, f) {
  const flow = board.flows[f]
  const cols = columns(flow)
  const flowEnd = flowEndLine(board, f)
  return cols.map((c, i) => {
    const start = c.items[0].line
    const end = i + 1 < cols.length ? cols[i + 1].items[0].line : lastContentLine(board.lines, start, flowEnd) + 1
    return { col: c, start, end }
  })
}

function flowEndLine(board, f) {
  const next = board.flows[f + 1]
  return next ? next.headerLine : board.lines.length
}

function lastContentLine(lines, from, to) {
  let last = from
  for (let i = from; i < to; i++) if (lines[i].trim()) last = i
  return last
}

// Where a new sticker of `type` goes in column `column` of flow `f`.
function insertionLine(board, f, type, column) {
  const flow = board.flows[f]
  const ranges = columnRanges(board, f)
  if (!ranges.length) {
    const base = flow.headerLine ?? -1
    return base + 1
  }
  if (type === 'event') {
    if (column >= ranges.length) return ranges[ranges.length - 1].end
    return ranges[Math.max(0, column)].start
  }
  const r = ranges[Math.min(Math.max(0, column), ranges.length - 1)]
  const items = r.col.items
  if (BEFORE.has(type)) {
    const ev = items.find((i) => i.type === 'event')
    return ev ? ev.line : items[items.length - 1].line + 1
  }
  return items[items.length - 1].line + 1
}

function withId(line, id) {
  return line.replace(/\s*$/, '') + ` @${id}`
}

function replaceText(line, text) {
  const m = ITEM_RE.exec(line)
  if (!m) return line
  const oldLen = m[4].length
  const tail = m[5]
  // Keep the column of trailing tokens when the old text was padded to it.
  const pad = tail ? tail.length - tail.trimStart().length : 0
  const target = oldLen + pad
  const sep = tail ? ' '.repeat(Math.max(1, target - text.length)) : ''
  return m[1] + m[2] + m[3] + text + sep + tail.trimStart()
}

function applyOne(text, op, assigned) {
  const board = parse(text)
  const lines = board.lines.slice()
  const ensureId = (item) => {
    if (item.id) return item.id
    const id = newId(board, new Set(Object.values(assigned)))
    assigned[`L${item.line}`] = id
    lines[item.line] = withId(lines[item.line], id)
    return id
  }
  if (op.op === 'add') {
    const f = Math.min(Math.max(0, op.flow ?? 0), board.flows.length - 1)
    if (f < 0 || !TYPES.includes(op.type)) return text
    const id = newId(board, new Set(Object.values(assigned)))
    assigned[op.tempId ?? `new:${id}`] = id
    lines.splice(insertionLine(board, f, op.type, op.column ?? 0), 0, `${op.type} ${op.text.trim()} @${id}`)
    return lines.join('\n')
  }
  const found = findItem(board, op.id)
  if (!found) return text
  const { item } = found
  if (op.op === 'edit') {
    ensureId(item)
    lines[item.line] = replaceText(lines[item.line], op.text.replace(/\s+/g, ' ').trim())
    return lines.join('\n')
  }
  if (op.op === 'delete') {
    lines.splice(item.line, 1)
    return lines.join('\n')
  }
  if (op.op === 'move') {
    const f = Math.min(Math.max(0, op.flow ?? 0), board.flows.length - 1)
    ensureId(item)
    if (item.type === 'event' && f === found.flow) {
      const ranges = columnRanges(board, f)
      const from = ranges.findIndex((r) => r.col.items.includes(item))
      const to = Math.min(Math.max(0, op.column ?? 0), ranges.length - 1)
      if (from === to) return lines.join('\n')
      const block = lines.slice(ranges[from].start, ranges[from].end)
      const at = to < from ? ranges[to].start : ranges[to].end
      const rest = lines.slice()
      if (at > ranges[from].start) {
        rest.splice(at, 0, ...block)
        rest.splice(ranges[from].start, block.length)
      } else {
        rest.splice(ranges[from].start, block.length)
        rest.splice(at, 0, ...block)
      }
      return rest.join('\n')
    }
    const moved = lines[item.line]
    lines.splice(item.line, 1)
    const reparsed = parse(lines.join('\n'))
    const at = insertionLine(reparsed, f, item.type, op.column ?? 0)
    lines.splice(at, 0, moved)
    return lines.join('\n')
  }
  return text
}

export function applyOps(text, ops) {
  const assigned = {}
  let out = text
  // Line keys (`L<n>`) point into the original text: give those stickers ids before anything moves.
  const board = parse(text)
  const lines = board.lines.slice()
  for (const op of ops) {
    const found = op.id?.startsWith('L') && !assigned[op.id] && findItem(board, op.id)
    if (!found) continue
    const id = newId(board, new Set(Object.values(assigned)))
    assigned[op.id] = id
    lines[found.item.line] = withId(lines[found.item.line], id)
  }
  if (Object.keys(assigned).length) out = lines.join('\n')
  for (const raw of ops) {
    let op = raw
    if (op.id && assigned[op.id]) op = { ...op, id: assigned[op.id] }
    out = applyOne(out, op, assigned)
  }
  return { text: out, assigned }
}
