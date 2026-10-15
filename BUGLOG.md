# Folio BUGLOG

Issues found and fixed during the v1 completion sprint. Every entry records what broke, why, and the fix — so the same bug never ships twice.

## 2026-10-15 — phase2: templates + import tools

### Markdown import: nested list items rendered in reverse order
- **Found:** The clean-room list renderer's `closeFrame` emitted the still-open (most recent) item *before* the already-closed parts, so `- one / - two / nested` imported as "two, one" with the nested list in the wrong place.
- **Why:** The open item was treated as the list head instead of the list tail; order only breaks when a list has 2+ items, so a single-item smoke test missed it.
- **Fix:** `closeFrame` now renders `parts` first, then the open item (the open item is always the most recent). Verified with a multi-item nested/task-list fixture.
- **Status:** Fixed before commit. Verified via parser smoke test.

### Markdown import: eslint `no-control-regex` on code-span placeholders
- **Found:** Using `\u0000` as the inline-code placeholder delimiter tripped `no-control-regex`.
- **Why:** Control characters in regexes are banned by the lint config (and invisible in diffs).
- **Fix:** Switched the placeholder brackets to private-use escapes `\ue000` / `\ue001` — never control chars, never collide with real text.
- **Status:** Fixed before commit. `npx eslint .` clean.

## 2026-10-15 — phase2: calendar + gallery views

### Calendar day panel: unsafe `properties[1]!` non-null assertion
- **Found:** First draft of the calendar day panel resolved a "secondary" property via `database.properties[1]!` — a non-null assertion on an index that doesn't exist when a database has zero or one properties, which would crash the panel at runtime.
- **Why:** Copied the "show something extra" instinct from kanban without accounting for degenerate databases; the `!` silenced the compiler but not the crash.
- **Fix:** Rewrote the panel to filter `properties` (excluding the title and date props) and slice the first two — zero indexing by position, zero assertions. Empty extras render nothing.
- **Status:** Fixed before commit. Verified via typecheck + dev-server transform.

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

### Large binary pushes: shell argument limit
- **Found:** Pushing GIFs (>200KB base64) via Composio CLI failed with `Argument list too long`.
- **Why:** Shell `$(cat ...)` expansion exceeds ARG_MAX for large base64 payloads.
- **Fix:** Direct Python API calls to `POST /tools/execute/{slug}` with `user_id`, `arguments`, `connected_account_id` in JSON body (bypasses shell entirely). Correct endpoint is `/tools/execute/{slug}`, not `/tools/{slug}/execute`.
- **Status:** Fixed. Both demo GIFs pushed.
