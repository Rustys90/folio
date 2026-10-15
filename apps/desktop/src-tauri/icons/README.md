# App icons

The source of truth is `icon.svg` — a minimalist document mark in manuscript
blue (`#2e5bff`, the Folio accent token) on a transparent background.

All required bundle icons were generated from it with `tauri icon`:

- `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`, `icon.png`
- `icon.icns` (macOS) — 6 embedded sizes
- `icon.ico` (Windows) — 6 embedded sizes
- Android / iOS / Windows-Store variants (`android/`, `ios/`, `Square*.png`)

`tauri.conf.json`'s bundle `icon` list already points at them, so no
first-time setup is needed. If the SVG ever changes, regenerate from
`apps/desktop/` with:

```sh
npx tauri icon src-tauri/icons/icon.svg
```
