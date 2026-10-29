import { useEffect, useRef, useState } from 'react'
import { parseChat } from './core/chat.js'

// Chat with the board agent: comments pinned to stickers, questions with buttons, free text.
export default function ChatPanel({ chat, agent, onAnswer, onShow, onSay, onClose }) {
  const msgs = parseChat(chat)
  const end = useRef(null)
  const [draft, setDraft] = useState('')
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [chat, agent?.state])
  const busy = agent?.state === 'thinking'
  const submit = (e) => {
    e.preventDefault()
    if (!draft.trim()) return
    onSay(draft.trim())
    setDraft('')
  }

  return (
    <aside className="chat">
      <header>
        <span className={`dot${busy ? ' busy' : ''}`} />
        <b>Агент</b>
        <span className="status">{busy ? agent.label ?? 'думает…' : 'на связи'}</span>
        <button className="close" onClick={onClose} title="Свернуть">›</button>
      </header>
      <div className="msgs">
        {!msgs.length && <div className="none">Напишите агенту, что разбираем: задачу, МР или часть кода</div>}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.kind}${m.ref ? ' linked' : ''}`} onClick={() => m.ref && onShow(m.ref)}>
            <div className="who">{m.kind === 'user' ? 'вы' : 'агент'}{m.ref && <span className="ref"> · к стикеру</span>}</div>
            <div>{m.text}</div>
            {m.kind === 'ask' && (
              <div className="opts">
                {m.options.map((o) => (
                  <button
                    key={o}
                    className={m.answer === o ? 'chosen' : ''}
                    disabled={m.answer !== null}
                    onClick={(e) => { e.stopPropagation(); onAnswer(m.id, o) }}
                  >{o}</button>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="msg agent typing">{agent.label ?? 'думает'}…</div>}
        <div ref={end} />
      </div>
      <form className="say" onSubmit={submit}>
        <textarea
          value={draft}
          placeholder="Написать агенту…"
          rows={2}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e) }}
        />
      </form>
    </aside>
  )
}

export function pendingQuestions(chat) {
  return parseChat(chat).filter((m) => m.kind === 'ask' && m.answer === null).length
}
