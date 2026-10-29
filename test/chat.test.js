import { describe, it, expect } from 'vitest'
import { parseChat, answerLine } from '../src/core/chat.js'

const CHAT = `agent: «Оплата» — не событие. В коде два пути: вебхук и поллинг →a1
ask @q1: Лента собрана, завершаем шаг? [Да, к ключевым событиям | Ещё 5 минут | Нет]
какая-то строка без префикса
user: посмотри, что с оплатой
answer @q1: Ещё 5 минут
`

describe('parseChat', () => {
  const msgs = parseChat(CHAT)

  it('parses agent message with sticker ref', () => {
    expect(msgs[0]).toEqual({ kind: 'agent', text: '«Оплата» — не событие. В коде два пути: вебхук и поллинг', ref: 'a1' })
  })

  it('parses question with options and merges its answer', () => {
    expect(msgs[1]).toEqual({
      kind: 'ask', id: 'q1', text: 'Лента собрана, завершаем шаг?', ref: null,
      options: ['Да, к ключевым событиям', 'Ещё 5 минут', 'Нет'], answer: 'Ещё 5 минут',
    })
  })

  it('keeps user lines and skips answer and unknown lines', () => {
    expect(msgs.map((m) => m.kind)).toEqual(['agent', 'ask', 'user'])
    expect(msgs[2].text).toBe('посмотри, что с оплатой')
  })

  it('unanswered question has null answer', () => {
    expect(parseChat('ask @q2: Ок? [Да | Нет]')[0].answer).toBe(null)
  })

  it('empty or missing chat', () => {
    expect(parseChat('')).toEqual([])
    expect(parseChat(null)).toEqual([])
  })
})

describe('answerLine', () => {
  it('formats answer, rejects unknown question or option', () => {
    expect(answerLine(CHAT, 'q1', 'Нет')).toBe('answer @q1: Нет')
    expect(answerLine(CHAT, 'q9', 'Нет')).toBe(null)
    expect(answerLine(CHAT, 'q1', 'Может быть')).toBe(null)
  })
})
