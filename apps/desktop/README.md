# Folio Desktop

The desktop shell for [Folio](../../README.md) — a thin
[Tauri v2](https://tauri.app) wrapper that ships the web app
(`@folio/web`) as a native macOS / Windows / Linux application.

The web codebase stays the single source of truth. This package adds no UI
of its own; it just points Tauri at the web app's dev server or production
build.

## Prerequisites

- **Node.js ≥ 20** (repo root engines)
- **Rust stable** (≥ 1.77) via [rustup](https://rustup.rs)
- OS-specific Tauri build dependencies —
  [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)

## Commands

All commands run from the repo root:

```sh
npm run dev:desktop    # Tauri dev — Vite dev server + hot-reload shell
npm run build:desktop  # production web build, then native bundles
```

Or directly inside `apps/desktop/`:

```sh
npm run tauri:dev
npm run tauri:build
```

App icons (PNG/ICO/ICNS) are already generated in `src-tauri/icons/`, so
`tauri:build` works out of the box. If the icon SVG changes, regenerate
with `npx tauri icon src-tauri/icons/icon.svg` from `apps/desktop/`.

## Configuration notes

- `identifier` is `com.folio.app` — a placeholder. Change it in
  `src-tauri/tauri.conf.json` to your own reverse-domain before shipping.
- `frontendDist` points at `../web/dist`, so `tauri:build` always bundles a
  fresh production web build (built via `beforeBuildCommand`).
- `devUrl` points at the Vite dev server (`http://localhost:5173`) for
  `tauri:dev`.
- Window defaults: 1280×800, minimum 900×600, native decorations.

## CI / release builds

Desktop builds only run on maintainer machines with Rust installed. The
web-only CI (`npm run typecheck`, `npm run lint`, `npm run build` at the
root) never touches Tauri — this package has no `build` script on purpose,
so root builds stay Rust-free.
