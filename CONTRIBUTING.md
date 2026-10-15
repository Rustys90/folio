# Contributing to Folio

Thanks for wanting to make Folio better. This project lives or dies by its
contributors, and that includes you.

## Ground rules

- **Clean-room only.** Never paste code, assets, or text from Notion, AppFlowy,
  Anytype, or any other proprietary or copyleft-incompatible product. Concepts are
  fine; copied code is not.
- **One focused PR per change.** Small, reviewable beats big and brave.
- **Tokens, not hex codes.** UI work must use the design tokens in
  `packages/ui/src/tokens.css` — no hardcoded colors.
- **Tests for behavior.** If you change editor or sync behavior, add or update a test.

## Getting started

1. Fork the repo and clone your fork.
2. `npm install` at the repo root (npm workspaces).
3. `npm run dev` to start the web app; `npm run dev:server` for the sync server.
4. Create a branch: `git checkout -b feat/my-change`.

## Development workflow

```bash
npm run typecheck   # TypeScript across all workspaces
npm run lint        # ESLint
npm run format      # Prettier
npm run build       # Production builds
```

## Pull requests

- Describe **what** changed and **why** in plain language.
- Include a screenshot or short clip for any UI change.
- Keep the PR title in conventional-commit style: `feat:`, `fix:`, `docs:`,
  `chore:`, `refactor:`.

## Reporting bugs

Open an issue with: what you did, what you expected, what happened, and your
browser/OS. A minimal reproduction is worth a thousand words.

## Code of conduct

Be kind. Read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — it's short, and we mean it.
