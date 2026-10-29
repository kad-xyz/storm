// Canvas changes -> board ops. Stickers are matched by customData.stormId.
import { dropTarget } from './core/layout.js'
import { elementId } from './ids.js'

const JITTER = 20
const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim()

export function sceneToOps(prevPlaced, elements, board) {
  const live = elements.filter((e) => !e.isDeleted)
  const stickers = live.filter((e) => e.customData?.stormId)
  const stickerIds = new Set(stickers.map((e) => e.id))
  const labelOf = new Map(live.filter((e) => e.type === 'text' && e.containerId).map((e) => [e.containerId, clean(e.originalText ?? e.text)]))
  const ops = []
  let moved = false

  for (const p of prevPlaced) {
    const el = stickers.find((e) => e.id === elementId(p.key))
    if (!el) { ops.push({ op: 'delete', id: p.key }); continue }
    const text = labelOf.get(el.id)
    if (text && text !== clean(p.text)) ops.push({ op: 'edit', id: p.key, text })
    if (Math.abs(el.x - p.x) > JITTER || Math.abs(el.y - p.y) > JITTER) {
      moved = true
      const t = dropTarget(board, p.type, el.x, el.y)
      if (t.flow !== p.flow || t.column !== p.column) ops.push({ op: 'move', id: p.key, ...t })
    }
  }

  const known = new Set(prevPlaced.map((p) => elementId(p.key)))
  for (const el of stickers) {
    if (known.has(el.id)) continue
    const text = labelOf.get(el.id)
    if (!text) continue
    ops.push({ op: 'add', type: el.customData.stormType, text, ...dropTarget(board, el.customData.stormType, el.x, el.y) })
  }

  const extras = live.filter((e) => !stickerIds.has(e.id) && !(e.containerId && stickerIds.has(e.containerId)) && !e.customData?.stormLabel)
  return { ops, extras, moved }
}
