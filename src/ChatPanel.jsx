import { useEffect, useRef } from 'react'
import { parseChat } from './core/chat.js'

// Comments and questions from the assistant next to the board; the conversation itself stays in the terminal.
export default function ChatPanel({ chat, onAnswer, onShow, onClose }) {
  const msgs = parseChat(chat)
  const end = useRef(null)
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [chat])

  return (
    <aside className="chat">
      <header>
        <b>Комментарии</b>
        <button className="close" onClick={onClose} title="Свернуть">›</button>
      </header>
      <div className="msgs">
        {!msgs.length && <div className="none">Здесь появятся пояснения и вопросы по доске</div>}
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
        <div ref={end} />
      </div>
      <footer>Отвечать голосом — в терминале</footer>
    </aside>
  )
}

export function pendingQuestions(chat) {
  return parseChat(chat).filter((m) => m.kind === 'ask' && m.answer === null).length
}
