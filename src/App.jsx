import { useCallback, useEffect, useRef, useState } from 'react'
import { Excalidraw, CaptureUpdateAction } from '@excalidraw/excalidraw'
import { parse } from './core/format.js'
import { layout } from './core/layout.js'
import { toElements } from './scene.js'
import { PHASES } from './phases.js'
import { STICKERS } from './stickers.js'
import { answer, clientId, getBoard, listBoards, postOps, putExtras, subscribe } from './api.js'
import ChatPanel, { pendingQuestions } from './ChatPanel.jsx'
import { elementId } from './ids.js'
import { sceneToOps } from './diff.js'
import { dropTarget } from './core/layout.js'

const slugFromHash = () => decodeURIComponent(location.hash.replace(/^#\/?/, ''))

export default function App() {
  const [boards, setBoards] = useState([])
  const [slug, setSlug] = useState(slugFromHash)
  const [board, setBoard] = useState(null)
  const [missing, setMissing] = useState(false)
  const [chat, setChat] = useState('')
  const [chatOpen, setChatOpen] = useState(() => localStorage.getItem('storm.chat') !== 'closed')
  const apiRef = useRef(null)
  const state = useRef({ text: null, extras: [], placed: [], pending: null, timer: null })
  const signature = (els) => els.map((e) => `${e.id}:${e.version}`).join(',')

  const render = useCallback((text, extras = state.current.extras) => {
    const parsed = parse(text)
    const placed = layout(parsed)
    Object.assign(state.current, { text, extras, placed, board: parsed, extrasSig: signature(extras), pending: null })
    setBoard(parsed)
    apiRef.current?.updateScene({
      elements: [...toElements(placed), ...extras],
      captureUpdate: CaptureUpdateAction.NEVER,
    })
  }, [])

  // Push canvas edits back to the board file once a gesture or text edit is over.
  const sync = useCallback(async () => {
    const api = apiRef.current
    const st = state.current
    if (!api || st.text === null) return
    if (api.getAppState().editingTextElement) return
    const slug = slugFromHash()
    const { ops, extras, moved } = sceneToOps(st.placed, api.getSceneElementsIncludingDeleted(), st.board)
    if (signature(extras) !== st.extrasSig) {
      st.extras = extras
      st.extrasSig = signature(extras)
      putExtras(slug, extras).catch(() => {})
    }
    if (ops.length) {
      const res = await postOps(slug, ops, st.text).catch(() => null)
      render(res ? res.text : st.pending ?? st.text)
    } else if (st.pending !== null) {
      render(st.pending)
    } else if (moved) {
      render(st.text)
    }
  }, [render])

  const onChange = useCallback((_, appState) => {
    clearTimeout(state.current.timer)
    state.current.timer = null
    if (appState.editingTextElement || appState.cursorButton === 'down') return
    state.current.timer = setTimeout(() => { state.current.timer = null; sync() }, 300)
  }, [sync])

  const addSticker = useCallback(async (type) => {
    const api = apiRef.current
    const st = state.current
    if (!api || st.text === null) return
    const { scrollX, scrollY, zoom, width, height } = api.getAppState()
    const x = -scrollX + width / 2 / zoom.value
    const y = -scrollY + height / 2 / zoom.value
    const res = await postOps(slugFromHash(), [{ op: 'add', type, text: STICKERS[type].placeholder, ...dropTarget(st.board, type, x, y) }], st.text).catch(() => null)
    if (res) render(res.text)
  }, [render])

  // Option+1…8 adds a sticker (plain digits are Excalidraw tool shortcuts).
  useEffect(() => {
    const types = Object.keys(STICKERS)
    const onKey = (e) => {
      const n = /^Digit([1-8])$/.exec(e.code)
      if (!n || !e.altKey || apiRef.current?.getAppState().editingTextElement) return
      e.preventDefault()
      e.stopPropagation()
      addSticker(types[Number(n[1]) - 1])
    }
    addEventListener('keydown', onKey, true)
    return () => removeEventListener('keydown', onKey, true)
  }, [addSticker])

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
      .then(({ text, extras, chat }) => {
        render(text, extras)
        setChat(chat ?? '')
        setTimeout(() => apiRef.current?.scrollToContent(undefined, { fitToContent: true }), 50)
      })
      .catch(() => { setMissing(true); setBoard(null) })
  }, [slug, render])

  useEffect(() => subscribe((msg) => {
    listBoards().then(setBoards)
    if (msg.slug !== slugFromHash() || msg.origin === clientId) return
    if (msg.text === null) { setMissing(true); setBoard(null); return }
    setMissing(false)
    const busy = apiRef.current?.getAppState()
    // While typing, dragging or with an edit not yet sent, the incoming text waits for sync().
    if (busy?.editingTextElement || busy?.cursorButton === 'down' || state.current.timer) state.current.pending = msg.text
    else render(msg.text)
  }, (msg) => {
    if (msg.slug === slugFromHash()) setChat(msg.chat)
  }), [render])

  const toggleChat = (open) => {
    setChatOpen(open)
    localStorage.setItem('storm.chat', open ? 'open' : 'closed')
  }

  // Select and centre the sticker a comment is about.
  const showSticker = useCallback((ref) => {
    const api = apiRef.current
    const el = api?.getSceneElements().find((e) => e.id === elementId(ref))
    if (!el) return
    api.updateScene({ appState: { selectedElementIds: { [el.id]: true } }, captureUpdate: CaptureUpdateAction.NEVER })
    api.scrollToContent(el, { animate: true })
  }, [])

  const onAnswer = (id, option) => answer(slugFromHash(), id, option).then((r) => setChat(r.chat)).catch(() => {})
  const waiting = pendingQuestions(chat)

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
              <button key={type} style={{ background: s.color }} title={`Добавить: ${s.label} (⌥${i + 1})`} onClick={() => addSticker(type)}>
                <kbd>⌥{i + 1}</kbd>{s.label}
              </button>
            ))}
          </div>
          <span className="spacer" />
          <button className="tool" onClick={() => state.current.text !== null && render(state.current.text)}>Выровнять заново</button>
          {!chatOpen && (
            <button className="tool" onClick={() => toggleChat(true)}>
              Комментарии{waiting > 0 && <span className="badge">{waiting}</span>}
            </button>
          )}
        </div>
        {phase && (
          <div className="phase">
            <b>Шаг {board.phase}/{PHASES.length} · {phase.title}</b>
            <span className="hint">{phase.hint}</span>
            <span className="dots">{PHASES.map((_, i) => (i < board.phase ? '●' : '○')).join('')}</span>
          </div>
        )}
        <div className="work">
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
              onChange={onChange}
              langCode="ru-RU"
              initialData={{ appState: { viewBackgroundColor: '#ffffff' } }}
            />
          )}
        </div>
        {chatOpen && !missing && (
          <ChatPanel chat={chat} onAnswer={onAnswer} onShow={showSticker} onClose={() => toggleChat(false)} />
        )}
        </div>
      </main>
    </div>
  )
}
