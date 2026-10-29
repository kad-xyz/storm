import { describe, it, expect } from 'vitest'
import { parse } from '../src/core/format.js'
import { layout, dropTarget, COL_W, STICKER_H, ROW_GAP } from '../src/core/layout.js'
import { AUTH } from './fixtures.js'

const byKey = (placed, k) => placed.find((p) => p.key === k)

describe('layout', () => {
  const board = parse(AUTH)
  const placed = layout(board)

  it('event of column 2 is right of column 1', () => {
    expect(byKey(placed, 'a2').x - byKey(placed, 'a1').x).toBe(COL_W)
    expect(byKey(placed, 'a2').y).toBe(byKey(placed, 'a1').y)
  })

  it('branch starts after from column', () => {
    const rejected = placed.find((p) => p.text === 'Вход отклонён')
    expect(rejected.x).toBe(byKey(placed, 'a2').x)
    expect(rejected.y).toBeGreaterThan(Math.max(...placed.filter((p) => p.flow === 0).map((p) => p.y)))
  })

  it('stack order actor above command above event above policy', () => {
    const y = (t) => placed.find((p) => p.type === t && p.flow === 0).y
    expect(y('actor')).toBeLessThan(y('command'))
    expect(y('command')).toBeLessThan(y('event'))
    expect(y('event')).toBeLessThan(y('policy'))
  })

  it('attached hot sits under ref', () => {
    const hot = byKey(placed, 'h1')
    const a2 = byKey(placed, 'a2')
    expect(hot.attached).toBe(true)
    expect(hot.x).toBe(a2.x)
    expect(hot.y).toBe(a2.y + STICKER_H + ROW_GAP)
  })

  it('dangling ref falls back to hot lane', () => {
    const p = layout(parse('## flow\nevent A @a\npolicy P\nhot Q @q →zzz'))
    const q = byKey(p, 'q')
    expect(q.attached).toBe(false)
    expect(q.y).toBeGreaterThan(p.find((x) => x.type === 'policy').y)
  })

  it('empty board', () => {
    expect(layout(parse(''))).toEqual([])
  })
})

describe('dropTarget', () => {
  const board = parse(AUTH)
  const placed = layout(board)

  it('returns nearest column', () => {
    const a2 = byKey(placed, 'a2')
    expect(dropTarget(board, 'event', a2.x + 30, a2.y)).toEqual({ flow: 0, column: 1 })
    const a1 = byKey(placed, 'a1')
    expect(dropTarget(board, 'command', a1.x - 40, a1.y - 50)).toEqual({ flow: 0, column: 0 })
  })

  it('drop beyond bounds clamps', () => {
    expect(dropTarget(board, 'event', 10000, 0)).toEqual({ flow: 0, column: 1 })
    expect(dropTarget(board, 'event', 10000, 100000)).toEqual({ flow: 1, column: 0 })
    expect(dropTarget(board, 'event', -500, -500)).toEqual({ flow: 0, column: 0 })
  })
})
