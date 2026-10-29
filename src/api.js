export const clientId = Math.random().toString(36).slice(2)

const asJson = async (res) => {
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })
  return res.json()
}
const send = (method, url, body) =>
  fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(asJson)

export const listBoards = () => fetch('/api/boards').then(asJson)
export const getBoard = (slug) => fetch(`/api/boards/${encodeURIComponent(slug)}`).then(asJson)
export const postOps = (slug, ops) => send('POST', `/api/boards/${encodeURIComponent(slug)}/ops`, { ops, clientId })
export const putExtras = (slug, extras) => send('PUT', `/api/boards/${encodeURIComponent(slug)}/extras`, { extras })

export function subscribe(onBoard) {
  const es = new EventSource('/api/events')
  es.addEventListener('board', (e) => onBoard(JSON.parse(e.data)))
  return () => es.close()
}
