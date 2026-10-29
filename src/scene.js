// Placed stickers -> Excalidraw elements with stable ids.
import { convertToExcalidrawElements } from '@excalidraw/excalidraw'
import { STICKERS, ATTACHED_COLOR } from './stickers.js'

export const elementId = (key) => `st-${key}`

export function toElements(placed) {
  const skeletons = placed.map((p) => ({
    type: 'rectangle',
    id: elementId(p.key),
    x: p.x, y: p.y, width: p.w, height: p.h,
    backgroundColor: p.attached ? ATTACHED_COLOR : STICKERS[p.type].color,
    fillStyle: 'solid',
    strokeColor: p.attached ? '#868e96' : '#495057',
    strokeStyle: p.attached ? 'dashed' : 'solid',
    strokeWidth: 1,
    roughness: 0,
    roundness: { type: 3 },
    label: { text: p.text, fontSize: 16, fontFamily: 2 },
    customData: { stormId: p.key, stormType: p.type },
  }))
  const elements = convertToExcalidrawElements(skeletons, { regenerateIds: false })
  // Give labels stable ids too, so updates do not churn the scene.
  const rename = new Map()
  for (const el of elements) {
    if (el.type === 'text' && el.containerId) {
      const id = `${el.containerId}-t`
      rename.set(el.id, id)
      el.id = id
      el.customData = { stormLabel: el.containerId }
    }
  }
  for (const el of elements) {
    if (el.boundElements) el.boundElements = el.boundElements.map((b) => ({ ...b, id: rename.get(b.id) ?? b.id }))
  }
  return elements
}
