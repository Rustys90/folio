# Folio BUGLOG

Issues found and fixed during the v1 completion sprint. Every entry records what broke, why, and the fix — so the same bug never ships twice.

## 2026-10-15 — v1 completion sprint

### Push pipeline: Composio file-update requires `sha` for existing files
- **Found:** Pushing modified files via `GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS` failed with `"sha" wasn't supplied`.
- **Why:** GitHub's update-file API requires the current blob SHA for existing files (new files don't need it).
- **Fix:** Fetch SHA first via MCP `get_file_contents` (SHA is in the response text), then include it in the update call. New files push without SHA.
- **Status:** Fixed. All 69 scaffold/database/desktop files pushed.

### Push pipeline: Composio response parsing
- **Found:** Success responses (commit objects) were misclassified as failures by naive string checks.
- **Why:** Pretty-printed JSON contains `"commit"` but a brittle `"error" not in output` check can misfire on truncated output.
- **Fix:** Check for the commit object's `html_url` / `sha` presence; treat `"message":"Invalid request"` as the real error signal.
- **Status:** Fixed. Verified via `list_commits`.

### Composio CLI: broken `sys.path` for `dynamic_credentials`
- **Found:** `bin/composio` crashed with `ModuleNotFoundError: No module named 'dynamic_credentials'`.
- **Why:** Script inserts `/opt/muse/skills/custom-connector-setup/templates/skill/bin` into `sys.path`, but the module lives at `/opt/muse/skills/custom-connector-setup/bin/`.
- **Fix:** Run with `PYTHONPATH=/opt/muse/skills/custom-connector-setup/bin`.
- **Status:** Workaround in use. Upstream fix not applied (connector is user-owned).

### GitHub MCP App: cannot create repos or push (403)
- **Found:** `create_repository` and `push_files` both return `403 Resource not accessible by integration`.
- **Why:** The GitHub App installation lacks repository-creation and contents-write scopes for new repos.
- **Fix:** Repo created via Composio OAuth (`GITHUB_CREATE_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER`); all pushes go through Composio. Long-term: Stark should grant the App access to the `folio` repo in GitHub App settings.
- **Status:** Workaround in use.

### Tauri: no Rust toolchain in build environment
- **Found:** `cargo` not available; `tauri build` impossible here.
- **Why:** This is a Linux VM without Rust installed.
- **Fix:** Scaffolded full Tauri v2 project (config, Cargo.toml, main.rs, icons via `tauri icon` which runs without Rust). Builds happen on maintainer machines. Documented in `apps/desktop/README.md`.
- **Status:** Accepted limitation, documented.

### Polish pass: `git reset --hard` wiped in-progress App.tsx/app.css edits
- **Found:** After syncing local with `git reset --hard origin/main`, the polish worker's modifications to `App.tsx` and `app.css` were lost (new files survived as untracked).
- **Why:** `reset --hard` discards all uncommitted changes to tracked files. The worker was still running.
- **Fix:** Worker re-applied App.tsx changes post-reset (verified 8 integration points present). Re-added `folio-shimmer` CSS manually to app.css. Lesson: never `reset --hard` while workers are still writing.
- **Status:** Fixed. Verified via grep + typecheck.

### CRITICAL: Tailwind v4 not scanning packages/ui — modals rendered broken
- **Found:** Command palette rendered at bottom of page, cut off, no backdrop. `ModalContent` had `position: static`.
- **Why:** Tailwind v4 auto-scans only the Vite root (`apps/web/`). Utilities used exclusively in `packages/ui` (`fixed`, `inset-0`, `z-50`) were never generated.
- **Fix:** Added `@source "../../../packages/{ui,editor,sync}/src";` to `apps/web/src/app.css`. (First attempt used wrong relative depth `../../` — fixed to `../../../`.)
- **Status:** Fixed. Verified `.fixed` present in production CSS build.
