# Storm

A lightweight, local [Event Storming](https://www.eventstorming.com/) board that lives in your browser.
The board is a plain-text file: edit it in any editor (or let a tool write it) and the
[Excalidraw](https://github.com/excalidraw/excalidraw) canvas updates instantly. Drag, rename or delete
stickers with the mouse and the file is updated in place.

- **Plain text is the source of truth** — one sticker per line, easy to diff, grep and generate.
- **Live** — file changes appear on the canvas in well under a second, no reload.
- **Two-way** — mouse edits are written back as minimal line patches; comments, unknown lines and alignment survive.
- **Snap-to-grid** — no coordinates in the file; the layout is derived from line order.
- **Guided sessions** — an optional `phase:` header shows the current Event Storming step.
- **Local only** — no accounts, no database, no cloud.

## Quick start

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm start          # http://localhost:5180
```

Boards live in `boards/<slug>.md`; open `http://localhost:5180/#/<slug>`.
A sample board is included: `boards/auth.md`.

## Board format

```
# Password sign-in
source: TRACKER-456
phase: 2

## flow
actor   Player
command Enter login and password
ui      Sign-in form
system  Auth API
event   Credentials verified        @a1
policy  When verified — issue tokens
event   Tokens issued               @a2
hot     What if the password is wrong 5 times?   @h1 →a2

## flow Sign-in rejected ←a1
event   Sign-in rejected
```

| Type        | Colour      | Meaning                               |
|-------------|-------------|---------------------------------------|
| `event`     | orange      | Something that happened (past tense)  |
| `command`   | blue        | What triggered it                     |
| `actor`     | yellow      | Who did it                            |
| `policy`    | lilac       | "When X, then Y"                      |
| `ui`        | green       | What the person sees (read model)     |
| `system`    | pink        | External system                       |
| `hot`       | red         | Question, risk, problem               |
| `aggregate` | pale yellow | Aggregate (optional)                  |

Rules:

- A line is `<type> <text> [@id] [→ref]`. Lines that do not parse are kept as they are and ignored.
- Lines within a `## flow` are in time order. Every `event` opens a column; `actor`, `command`, `ui`,
  `system` and `aggregate` lines before it belong to that column, `policy` and `hot` lines after it too.
- `## flow <name> ←id` is a branch that starts after event `id`, drawn as a lane below.
- `@id` is an optional stable id. `hot … →id` attaches a question under sticker `id` (dashed).
- `phase: 1–6` shows the step strip: Brainstorm → Order → Key events → Commands & actors → Policies & systems → Hot spots.
- Hand-drawn arrows, frames and free text are kept in `boards/<slug>.layout.json`.

## Comments panel

`boards/<slug>.chat.md` is shown in a panel next to the board, one message per line:

```
agent: Two code paths here: webhook and polling →a1
ask @q1: Timeline done, move on? [Yes | A few more minutes | No]
user: check the payment part
```

`→id` links a comment to a sticker (click it to select the sticker). Pressing an answer button appends
`answer @q1: Yes` to the file.

## On the canvas

- **Option+1…8** or the legend buttons add a sticker; double-click to edit its text.
- Drag a sticker to another column or lane; the file is reordered and the board snaps back to the grid.
- **Выровнять заново** (re-align) redraws everything from the file.
- While you are typing in a sticker, incoming file changes wait until you finish.

## Development

```sh
npm test
```

- `src/core/format.js` — parser and line-level patcher of the board format
- `src/core/layout.js` — grid layout and drop target
- `server/storm.js` — REST + server-sent events over `boards/`, mounted into the Vite dev server
- `src/` — React page with Excalidraw

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
