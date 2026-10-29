export const clientId = Math.random().toString(36).slice(2)

const asJson = async (res) => {
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })
  return res.json()
}
const send = (method, url, body) =>
  fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(asJson)

export const listBoards = () => fetch('/api/boards').then(asJson)
export const getBoard = (slug) => fetch(`/api/boards/${encodeURIComponent(slug)}`).then(asJson)
export const postOps = (slug, ops, base) => send('POST', `/api/boards/${encodeURIComponent(slug)}/ops`, { ops, base, clientId })
export const putExtras = (slug, extras) => send('PUT', `/api/boards/${encodeURIComponent(slug)}/extras`, { extras })

export const answer = (slug, id, option) => send('POST', `/api/boards/${encodeURIComponent(slug)}/answer`, { id, option })

export const say = (slug, text) => send('POST', `/api/boards/${encodeURIComponent(slug)}/say`, { text })

export function subscribe(onBoard, onChat, onAgent) {
  const es = new EventSource('/api/events')
  es.addEventListener('board', (e) => onBoard(JSON.parse(e.data)))
  es.addEventListener('chat', (e) => onChat(JSON.parse(e.data)))
  es.addEventListener('agent', (e) => onAgent(JSON.parse(e.data)))
  return () => es.close()
}
