import { useCallback, useEffect, useRef, useState } from 'react'
import { Excalidraw, CaptureUpdateAction } from '@excalidraw/excalidraw'
import { parse } from './core/format.js'
import { layout } from './core/layout.js'
import { toElements } from './scene.js'
import { PHASES } from './phases.js'
import { STICKERS } from './stickers.js'
import { clientId, getBoard, listBoards, subscribe } from './api.js'

const slugFromHash = () => decodeURIComponent(location.hash.replace(/^#\/?/, ''))

export default function App() {
  const [boards, setBoards] = useState([])
  const [slug, setSlug] = useState(slugFromHash)
  const [board, setBoard] = useState(null)
  const [missing, setMissing] = useState(false)
  const apiRef = useRef(null)
  const state = useRef({ text: null, extras: [], placed: [], pending: null })

  const render = useCallback((text, extras = state.current.extras) => {
    const parsed = parse(text)
    const placed = layout(parsed)
    Object.assign(state.current, { text, extras, placed, board: parsed })
    setBoard(parsed)
    apiRef.current?.updateScene({
      elements: [...toElements(placed), ...extras],
      captureUpdate: CaptureUpdateAction.NEVER,
    })
  }, [])

  useEffect(() => {
    const onHash = () => setSlug(slugFromHash())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => { listBoards().then(setBoards) }, [])

  useEffect(() => {
    if (!slug && boards.length) location.hash = `#/${boards[0].slug}`
  }, [slug, boards])

  useEffect(() => {
    if (!slug) return
    setMissing(false)
    getBoard(slug)
      .then(({ text, extras }) => {
        render(text, extras)
        setTimeout(() => apiRef.current?.scrollToContent(undefined, { fitToContent: true }), 50)
      })
      .catch(() => { setMissing(true); setBoard(null) })
  }, [slug, render])

  useEffect(() => subscribe((msg) => {
    listBoards().then(setBoards)
    if (msg.slug !== slugFromHash() || msg.origin === clientId) return
    if (msg.text === null) { setMissing(true); setBoard(null); return }
    setMissing(false)
    if (apiRef.current?.getAppState().editingTextElement) state.current.pending = msg.text
    else render(msg.text)
  }), [render])

  const phase = board?.phase && PHASES[board.phase - 1]

  return (
    <div className="app">
      <nav className="side">
        <h1>Storm</h1>
        {boards.map((b) => (
          <a key={b.slug} href={`#/${b.slug}`} className={b.slug === slug ? 'on' : ''}>{b.title}</a>
        ))}
      </nav>
      <main className="main">
        <div className="bar">
          <span className="title">{board?.title || slug}</span>
          <div className="legend">
            {Object.entries(STICKERS).map(([type, s], i) => (
              <button key={type} data-type={type} style={{ background: s.color }} title={`Добавить: ${s.label}`}>
                <kbd>{i + 1}</kbd>{s.label}
              </button>
            ))}
          </div>
          <span className="spacer" />
        </div>
        {phase && (
          <div className="phase">
            <b>Шаг {board.phase}/{PHASES.length} · {phase.title}</b>
            <span className="hint">{phase.hint}</span>
            <span className="dots">{PHASES.map((_, i) => (i < board.phase ? '●' : '○')).join('')}</span>
          </div>
        )}
        <div className="canvas">
          {missing ? (
            <div className="empty">Доска «{slug}» не найдена</div>
          ) : (
            <Excalidraw
              excalidrawAPI={(api) => {
                apiRef.current = api
                if (import.meta.env.DEV) window.storm = { api, state: state.current }
                if (state.current.text !== null) setTimeout(() => render(state.current.text), 0)
              }}
              langCode="ru-RU"
              initialData={{ appState: { viewBackgroundColor: '#ffffff' } }}
            />
          )}
        </div>
      </main>
    </div>
  )
}
