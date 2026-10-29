import { describe, it, expect } from 'vitest'
import { parse, applyOps, columns } from '../src/core/format.js'
import { layout, dropTarget } from '../src/core/layout.js'

describe('review fixes', () => {
  it('stale line keys are rebased onto the current file', () => {
    const base = '## flow\ncommand A\nevent E @e'
    const current = '## flow\nactor Кто-то\ncommand A\nevent E @e'
    const { text } = applyOps(current, [{ op: 'edit', id: 'L1', text: 'A2' }], base)
    expect(text.split('\n')).toEqual(['## flow', 'actor Кто-то', 'command A2 @s1', 'event E @e'])
  })

  it('stale line key whose sticker is gone is dropped', () => {
    const base = '## flow\ncommand A\nevent E @e'
    const current = '## flow\nevent E @e'
    expect(applyOps(current, [{ op: 'edit', id: 'L1', text: 'X' }], base).text).toBe(current)
  })

  it('hot referencing a hot or itself is drawn, not attached', () => {
    const b = parse('## flow\nevent A @a\nhot Q2 @h2 →h1\nhot Q1 @h1 →a\nhot Me @m →m')
    const placed = layout(b)
    expect(placed).toHaveLength(4)
    expect(placed.find((p) => p.key === 'h1').attached).toBe(true)
    expect(placed.find((p) => p.key === 'h2').attached).toBe(false)
    expect(placed.find((p) => p.key === 'm').attached).toBe(false)
  })

  it('event dropped right of the last column goes to the end', () => {
    const b = parse('## flow\nevent E1 @e1\nevent E2 @e2')
    const t = dropTarget(b, 'event', 5000, 0)
    expect(t).toEqual({ flow: 0, column: 2 })
    const { text } = applyOps('## flow\nevent E1 @e1\nevent E2 @e2', [{ op: 'add', type: 'event', text: 'E3', ...t }])
    expect(columns(parse(text).flows[0]).map((c) => c.items[0].text)).toEqual(['E1', 'E2', 'E3'])
  })

  it('own id starting with L is not a line key', () => {
    const t = '## flow\nevent Login @Login'
    const out = applyOps(t, [{ op: 'edit', id: 'Login', text: 'Вход' }]).text.split('\n')[1]
    expect(out).toMatch(/^event Вход +@Login$/)
  })

  it('board without flow keeps header and appends after it', () => {
    const t = '# Заголовок\nphase: 3\nevent A @a'
    const b = parse(t)
    expect(b.title).toBe('Заголовок')
    expect(b.phase).toBe(3)
    const empty = '# Пусто\n'
    const { text } = applyOps(empty, [{ op: 'add', type: 'event', text: 'X', flow: 0, column: 0 }])
    expect(text.split('\n')[0]).toBe('# Пусто')
    expect(text).toContain('event X @s1')
  })
})
