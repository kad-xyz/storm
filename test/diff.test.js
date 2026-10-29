import { describe, it, expect } from 'vitest'
import { parse } from '../src/core/format.js'
import { layout } from '../src/core/layout.js'
import { sceneToOps } from '../src/diff.js'
import { AUTH } from './fixtures.js'

// Minimal stand-ins for what Excalidraw hands to onChange.
function scene(placed) {
  return placed.flatMap((p) => [
    { id: `st-${p.key}`, type: 'rectangle', x: p.x, y: p.y, isDeleted: false, customData: { stormId: p.key, stormType: p.type } },
    { id: `st-${p.key}-t`, type: 'text', containerId: `st-${p.key}`, text: p.text, originalText: p.text, isDeleted: false },
  ])
}

const board = parse(AUTH)
const placed = layout(board)
const el = (els, id) => els.find((e) => e.id === id)

describe('sceneToOps', () => {
  it('unchanged scene → no ops', () => {
    expect(sceneToOps(placed, scene(placed), board)).toEqual({ ops: [], extras: [], moved: false })
  })

  it('text change → edit', () => {
    const els = scene(placed)
    el(els, 'st-a1-t').originalText = 'Пароль проверен'
    expect(sceneToOps(placed, els, board).ops).toEqual([{ op: 'edit', id: 'a1', text: 'Пароль проверен' }])
  })

  it('drag → move to drop target', () => {
    const els = scene(placed)
    el(els, 'st-a2').x = -30
    expect(sceneToOps(placed, els, board).ops).toEqual([{ op: 'move', id: 'a2', flow: 0, column: 0 }])
  })

  it('drag within own column → no op but moved', () => {
    const els = scene(placed)
    el(els, 'st-a2').y += 60
    expect(sceneToOps(placed, els, board)).toMatchObject({ ops: [], moved: true })
  })

  it('small jitter → no op', () => {
    const els = scene(placed)
    el(els, 'st-a2').x += 5
    expect(sceneToOps(placed, els, board)).toEqual({ ops: [], extras: [], moved: false })
  })

  it('sticker missing from the scene (canvas reset) → no delete', () => {
    const els = scene(placed).filter((e) => e.id !== 'st-h1' && e.id !== 'st-h1-t')
    expect(sceneToOps(placed, els, board).ops).toEqual([])
    expect(sceneToOps(placed, [], board).ops).toEqual([])
  })

  it('deleted sticker → delete', () => {
    const els = scene(placed)
    el(els, 'st-h1').isDeleted = true
    expect(sceneToOps(placed, els, board).ops).toEqual([{ op: 'delete', id: 'h1' }])
  })

  it('duplicated sticker → add', () => {
    const els = scene(placed)
    const a2 = el(els, 'st-a2')
    els.push({ ...a2, id: 'copy', x: a2.x + 10 }, { id: 'copy-t', type: 'text', containerId: 'copy', originalText: 'Токены выданы', isDeleted: false })
    expect(sceneToOps(placed, els, board).ops).toEqual([{ op: 'add', type: 'event', text: 'Токены выданы', flow: 0, column: 1 }])
  })

  it('free arrow → extras, no ops', () => {
    const els = scene(placed)
    const arrow = { id: 'ar', type: 'arrow', x: 0, y: 0, isDeleted: false }
    expect(sceneToOps(placed, [...els, arrow], board)).toEqual({ ops: [], extras: [arrow], moved: false })
  })
})
