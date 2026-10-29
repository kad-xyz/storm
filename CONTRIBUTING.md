# Contributing

Thanks for your interest in Storm!

## Getting started

```sh
npm install
npm test
npm start
```

## Guidelines

- Keep it light: no new runtime dependencies without a good reason.
- The board file is the source of truth. Anything the canvas changes must round-trip through
  `src/core/format.js` as a minimal line patch.
- Add a test for every behaviour change in `src/core`, `src/diff.js` or `server/` (Vitest, `test/`).
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `feat: …`, `fix: …`, `docs: …`.
- One topic per pull request; describe what changes for the person using the board.

## Reporting issues

Please include the board file (or a minimal part of it), what you did, what you expected and what happened.
