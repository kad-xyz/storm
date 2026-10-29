// Snap-to-grid layout: positions are always derived from the board file.
import { columns, key } from './format.js'

export const COL_W = 220
export const STICKER_W = 180
export const STICKER_H = 90
export const ROW_GAP = 16
export const LANE_GAP = 80

// Lanes inside a column, top to bottom.
export const LANES = ['actor', 'ui', 'command', 'system', 'event', 'aggregate', 'policy', 'hot']
const ROW = STICKER_H + ROW_GAP

// Geometry of every flow: start column, lane offsets, vertical band.
function geometry(board) {
  const startCol = new Map() // sticker key -> global column index
  const flows = []
  let top = 0
  board.flows.forEach((flow, f) => {
    const cols = columns(flow)
    const attachedKeys = attached(board)
    let offset = 0
    if (flow.from && startCol.has(flow.from)) offset = startCol.get(flow.from) + 1
    const laneRows = Object.fromEntries(LANES.map((l) => [l, 0]))
    cols.forEach((c) => {
      const count = {}
      c.items.forEach((i) => {
        if (attachedKeys.has(key(i))) return
        count[i.type] = (count[i.type] ?? 0) + 1
      })
      LANES.forEach((l) => (laneRows[l] = Math.max(laneRows[l], count[l] ?? 0)))
    })
    laneRows.event = Math.max(1, laneRows.event)
    // Room for questions stacked under events.
    const under = Math.max(0, ...cols.map((c) => c.items.filter((i) => attachedKeys.has(key(i))).length))
    const laneY = {}
    let y = top
    LANES.forEach((l) => {
      laneY[l] = y
      y += laneRows[l] * ROW
      if (l === 'event') y += under * ROW
    })
    cols.forEach((c, ci) => c.items.forEach((i) => startCol.set(key(i), offset + ci)))
    flows.push({ flow, cols, offset, laneY, top, bottom: y })
    top = y + LANE_GAP
  })
  return flows
}

function attached(board) {
  const out = new Set()
  const types = new Map(board.flows.flatMap((f) => f.items.map((i) => [key(i), i.type])))
  // A question pins under a regular sticker only; one pointing at a question (or itself) is drawn in its lane.
  board.flows.forEach((f) => f.items.forEach((i) => {
    if (i.type === 'hot' && i.ref && types.has(i.ref) && types.get(i.ref) !== 'hot') out.add(key(i))
  }))
  return out
}

export function layout(board) {
  const geo = geometry(board)
  const attachedKeys = attached(board)
  const placed = []
  geo.forEach(({ cols, offset, laneY }, f) => {
    cols.forEach((c, ci) => {
      const seen = {}
      c.items.forEach((i) => {
        if (attachedKeys.has(key(i))) return
        const n = seen[i.type] ?? 0
        seen[i.type] = n + 1
        placed.push({
          key: key(i), type: i.type, text: i.text,
          x: (offset + ci) * COL_W, y: laneY[i.type] + n * ROW,
          w: STICKER_W, h: STICKER_H, flow: f, column: ci, attached: false,
        })
      })
    })
  })
  const stack = {}
  geo.forEach(({ cols }, f) => cols.forEach((c, ci) => c.items.forEach((i) => {
    if (!attachedKeys.has(key(i))) return
    const target = placed.find((p) => p.key === i.ref)
    const n = stack[i.ref] ?? 0
    stack[i.ref] = n + 1
    placed.push({
      key: key(i), type: i.type, text: i.text,
      x: target.x, y: target.y + (n + 1) * ROW,
      w: STICKER_W, h: STICKER_H, flow: f, column: ci, attached: true,
    })
  })))
  return placed
}

// Which flow and column a sticker whose top-left corner is dropped at (x, y) belongs to.
export function dropTarget(board, type, x, y) {
  const geo = geometry(board)
  if (!geo.length) return { flow: 0, column: 0 }
  let f = geo.findIndex((g) => y < g.bottom + LANE_GAP / 2)
  if (f < 0) f = geo.length - 1
  const { cols, offset } = geo[f]
  if (!cols.length) return { flow: f, column: 0 }
  const col = Math.round(x / COL_W) - offset
  // An event dropped right of the last column extends the timeline.
  const last = type === 'event' ? cols.length : cols.length - 1
  return { flow: f, column: Math.min(Math.max(0, col), last) }
}
