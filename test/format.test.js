import { describe, it, expect } from 'vitest'
import { parse, columns, applyOps } from '../src/core/format.js'
import { AUTH } from './fixtures.js'

const lines = (t) => t.split('\n')

describe('parse', () => {
  it('parses title, flows, items', () => {
    const b = parse(AUTH)
    expect(b.title).toBe('Авторизация по паролю')
    expect(b.flows).toHaveLength(2)
    expect(b.flows[1].name).toBe('Ошибка входа')
    const hot = b.flows[0].items.find((i) => i.type === 'hot')
    expect(hot).toMatchObject({ id: 'h1', ref: 'a2', text: 'А если пароль неверный 5 раз?' })
    expect(b.flows[0].items[4]).toMatchObject({ type: 'event', id: 'a1', text: 'Учётные данные проверены' })
  })

  it('parses phase', () => {
    expect(parse(AUTH).phase).toBe(2)
    expect(parse('# x\n## flow\nevent A').phase).toBe(null)
    const t = '# x\nphase: abc\n## flow\nevent A'
    expect(parse(t).phase).toBe(null)
    expect(applyOps(t, []).text).toBe(t)
  })

  it('branch from', () => {
    expect(parse(AUTH).flows[1].from).toBe('a1')
    expect(parse(AUTH).flows[0].from).toBe(null)
  })

  it('board without flow headers is one unnamed flow', () => {
    const b = parse('event A\nevent B')
    expect(b.flows).toHaveLength(1)
    expect(b.flows[0].items.map((i) => i.text)).toEqual(['A', 'B'])
  })

  it('columns rule', () => {
    const cols = columns(parse(AUTH).flows[0])
    expect(cols).toHaveLength(2)
    expect(cols[0].eventId).toBe('a1')
    expect(cols[0].items.map((i) => i.type)).toEqual(['actor', 'command', 'ui', 'system', 'event', 'policy'])
    expect(cols[1].items.map((i) => i.type)).toEqual(['event', 'hot'])
  })

  it('keeps unknown lines', () => {
    const t = AUTH.replace('ui      Форма входа', 'evnt опечатка\n<!-- коммент -->\nui      Форма входа')
    const b = parse(t)
    expect(b.flows[0].items.map((i) => i.text)).not.toContain('опечатка')
    expect(applyOps(t, []).text).toBe(t)
  })
})

describe('applyOps', () => {
  it('edit preserves alignment', () => {
    const { text } = applyOps(AUTH, [{ op: 'edit', id: 'a1', text: 'Проверены' }])
    const a = lines(AUTH), b = lines(text)
    const i = a.findIndex((l) => l.includes('@a1'))
    expect(b[i].startsWith('event   Проверены ')).toBe(true)
    expect(b[i].indexOf('@a1')).toBe(a[i].indexOf('@a1'))
    b.forEach((l, j) => j !== i && expect(l).toBe(a[j]))
  })

  it('delete removes line only', () => {
    const { text } = applyOps(AUTH, [{ op: 'delete', id: 'h1' }])
    expect(lines(text)).toEqual(lines(AUTH).filter((l) => !l.includes('@h1')))
  })

  it('add assigns id', () => {
    const { text, assigned } = applyOps(AUTH, [{ op: 'add', type: 'policy', text: 'X', flow: 0, column: 1 }])
    const b = lines(text)
    const i = b.findIndex((l) => l.startsWith('policy X'))
    expect(b[i - 1]).toContain('@h1')
    expect(b[i]).toBe('policy X @s1')
    expect(Object.values(assigned)).toContain('s1')
  })

  it('add command goes before event of column', () => {
    const { text } = applyOps(AUTH, [{ op: 'add', type: 'command', text: 'Y', flow: 0, column: 1 }])
    const b = lines(text)
    expect(b[b.findIndex((l) => l.startsWith('command Y')) + 1]).toContain('@a2')
  })

  it('add event creates new column at index', () => {
    const { text } = applyOps(AUTH, [{ op: 'add', type: 'event', text: 'Z', flow: 0, column: 5 }])
    const cols = columns(parse(text).flows[0])
    expect(cols).toHaveLength(3)
    expect(cols[2].items[0].text).toBe('Z')
  })

  it('move event moves whole column', () => {
    const { text } = applyOps(AUTH, [{ op: 'move', id: 'a2', flow: 0, column: 0 }])
    const cols = columns(parse(text).flows[0])
    expect(cols.map((c) => c.eventId)).toEqual(['a2', 'a1'])
    expect(cols[0].items.map((i) => i.type)).toEqual(['event', 'hot'])
  })

  it('move command to other flow', () => {
    const b0 = parse(AUTH)
    const cmd = b0.flows[0].items.find((i) => i.type === 'command')
    const { text, assigned } = applyOps(AUTH, [{ op: 'move', id: `L${cmd.line}`, flow: 1, column: 0 }])
    const b = parse(text)
    const moved = b.flows[1].items.find((i) => i.type === 'command')
    expect(moved.text).toBe('Ввести логин и пароль')
    expect(moved.id).toBe(assigned[`L${cmd.line}`])
    expect(b.flows[0].items.find((i) => i.type === 'command')).toBeUndefined()
    expect(columns(b.flows[1])[0].items.map((i) => i.type)).toEqual(['command', 'event'])
  })

  it('unknown id is ignored', () => {
    expect(applyOps(AUTH, [{ op: 'edit', id: 'nope', text: 'x' }]).text).toBe(AUTH)
  })
})
