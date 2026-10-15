# Folio BUGLOG

Issues found and fixed during the v1 completion sprint. Every entry records what broke, why, and the fix — so the same bug never ships twice.

## 2026-10-15 — phase2: formulas

### `years` branch in `dateBetween` evaluated a nonsense comparison
- **Found:** Self-review of `apps/web/src/formula.ts` before the test run — the `years`/`year` unit branch computed `db.getFullYear() - da.getFullYear() - (db < new Date(da.getFullYear() + 1, da.getMonth(), da.getDate()) ? 0 : 0)`, i.e. it always subtracted 0 and never adjusted for partial years.
- **Why:** Drafted the anniversary check against the wrong anchor (the start date pushed a year forward instead of the end date compared against the start's month/day); the ternary was dead code that looked plausible at a glance.
- **Fix:** Full-year difference with the standard month/day anniversary adjustment, mirroring the `months` branch directly above it.
- **Status:** Fixed before commit. Covered by the formula test harness (`scripts/formula-test.ts`, 37 assertions).

### `pkill -f "vite…"` matched the invoking shell and SIGTERM'd it
- **Found:** After the dev smoke test, `pkill -f "vite.*5199"` killed the agent's own shell because the pattern appears in the shell's own command line.
- **Why:** `pkill -f` matches full command lines, and the command line doing the killing contains the pattern.
- **Fix:** No code change — process hygiene note: match the binary path (`pkill -f "vite( |$)"` won't help either; prefer `pkill -x node` scoped via a pidfile, or `fuser -k`). Recorded so the next worker doesn't repeat it.
- **Status:** Process recovered; dev server stop verified via `pgrep`.

## 2026-10-15 — phase2: relations & rollups

### Rollup `count` returned undefined without a target property
- **Found:** Data-model smoke test failed — `computeRollup` returned `undefined` for a `count` rollup whose `rollupPropertyId` was unset.
- **Why:** The early return `if (!relationProp || !property.rollupPropertyId) return undefined` ran before the `count` branch, but `count` counts linked rows and never reads the target property — so a perfectly valid count rollup rendered as "—".
- **Fix:** Moved the `rollupPropertyId` requirement below the `count` branch; only `sum`/`avg`/`min`/`max` require it. The property-creation UI always sets a target property anyway, but hand-built or older configs now behave correctly.
- **Status:** Fixed before commit. 16-assertion data-model test (resolve ordering, deleted-id dropping, all five functions, stale-config guards, self-relation) passes.

### Design: no live back-reference syncing between two-way relation sides
- **Found (design):** The two-way relation creates a reverse relation column on the target database, but the two sides are independent columns — adding a row id on side A does not write the reverse id into the target row's side-B cell.
- **Why:** True synced back-references would require every relation write to also patch the target database (a second `onChange`), turning a single-cell edit into a cross-database transaction with conflict/undo complications.
- **Fix:** Documented as the follow-up: reverse columns are a convenience for navigating/editing from the target side, not a synced mirror. Both columns read the same stored id arrays, so either side can be used to link rows; nothing crashes or desyncs because there is no invariant to break.
- **Status:** Implemented as documented. Not a bug — recorded as the relation contract.

### Design: rollup target properties exclude relation/rollup columns
- **Found (design):** The rollup "property to aggregate" dropdown only lists text/number/select/date properties of the target database.
- **Why:** Aggregating over another relation's id arrays is meaningless, and allowing rollup-over-rollup chains would permit dependency cycles with no evaluation-order story.
- **Fix:** `aggregatableProps` filters both out in the creation UI; `computeRollup` additionally skips array values at read time, so even a hand-edited config degrades to "—" instead of NaN.
- **Status:** Implemented.

## 2026-10-15 — phase2: file uploads

### Design: localStorage quota vs the 15MB refusal cap
- **Found (design):** Browsers cap localStorage at ~5MB per origin, so the spec'd "refuse over 15MB" cap is unreachable in practice — files between ~5MB and 15MB fail with a quota error instead of the size guard.
- **Why:** The brief mandates localStorage + data URLs; the quota is a browser constant, not something the store controls.
- **Fix:** `localAttachmentStore.save` catches the quota error and throws `AttachmentQuotaExceededError` with a plain-language message, rolled back cleanly (nothing is half-written); the UI surfaces it in the panel notice. Documented as the seam for the future S3 backend, which removes the constraint entirely.
- **Status:** Implemented. Not a bug — recorded as the storage contract.

### Design: image blocks store attachment ids, not bytes
- **Found (design):** Storing a data URL on the image node would duplicate megabytes of file bytes into the Yjs document (and every version-history snapshot).
- **Why:** TipTap image nodes conventionally carry `src` inline; here the bytes already live in the AttachmentStore.
- **Fix:** The clean-room `folioImage` node stores only `attachmentId` + `alt`; it resolves `src` through the host's `resolveAttachmentUrl` option — in the node view while editing, and at `renderHTML` time so `getHTML()` snapshots (version history, export) still show the image. Deleting an attachment renders the block as a quiet placeholder, never a broken image.
- **Status:** Implemented. typecheck + eslint clean, present in the production bundle.

### API deviation: `save(pageId, file)` instead of `save(file)`
- **Found (design):** The brief sketched `AttachmentStore.save(file)`, but the store cannot scope or list per page without the page id.
- **Why:** `list(pageId)` and `remove(id)` already carry the page scope; the store instance is not per-page.
- **Fix:** Interface is `save(pageId, file)`; the deviation is documented on the interface so a server implementation takes `pageId` the same way (bucket prefix / row column).
- **Status:** Implemented.

### Unused `event` param in the drop-zone drag-leave handler
- **Found:** `tsc` error TS6133 — the first draft of `handleDragLeave` declared `(event: DragEvent)` but never read it.
- **Why:** The counter-based enter/leave tracking doesn't need the event object.
- **Fix:** Dropped the parameter.
- **Status:** Fixed before commit. Typecheck clean.

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

## 2026-10-15 — phase2: block-level comments

### ESLint `no-this-alias` on TipTap extension `this` capture
- **Found:** First draft of the `FolioComments` extension captured `const extension = this` in `addProseMirrorPlugins` to reach `extension.editor.storage` from the decorations callback — `npx eslint .` failed on `@typescript-eslint/no-this-alias`.
- **Why:** Reached for extension storage out of habit; the alias was the lint error, but the deeper smell was depending on `this.editor` binding timing inside plugin setup.
- **Fix:** Rewrote to canonical ProseMirror plugin state: a module-scope `PluginKey`, `state.init/apply` holding the `Set<number>` of commented block indices, and the `setCommentedBlocks` command dispatching a meta-only transaction. No `this` capture at all.
- **Status:** Fixed before commit. `npx eslint .` clean, typecheck clean.

### App.tsx effect referenced `selectedPage` before its declaration
- **Found:** `tsc` errors TS2448/TS2454 — the comment-marker paint effect was placed above the `const selectedPage = …` declaration in App.tsx.
- **Why:** Effects were added next to the other comment effects higher in the component, but `selectedPage` is declared mid-component.
- **Fix:** Moved the paint effect below the `selectedPage`/`selectedDb` declarations.
- **Status:** Fixed before commit. Typecheck clean.

### Comment anchors survive edits via quote re-resolution
- **Found (design):** Storing only a block index would mis-anchor threads after inserts/deletes above the block.
- **Why:** TipTap has no stable per-block ids in this setup.
- **Fix:** Each anchor stores `blockIndex` + verbatim `quote` (selected text, or a block excerpt). `resolveAnchorIndex` prefers the block whose text still contains the quote, falling back to the clamped creation-time index. Documented as the seam for a future Yjs-backed CommentStore (interface already in `apps/web/src/comments.ts`).
- **Status:** Implemented. Not a bug — recorded as the anchoring contract.

## 2026-10-15 — phase2: page version history

### Preview unmounts would have orphaned the restore path
- **Found (design):** First draft conditionally unmounted the FolioEditor during version preview; restore then had no live editor to write through.
- **Why:** `activeEditor`/`editorRef` are cleared on unmount, and restore must go through TipTap commands (never direct Yjs writes) so Collaboration syncs it like a normal edit.
- **Fix:** The editor stays mounted during preview, hidden behind `hidden` while the read-only snapshot HTML renders in its place. Restore banks a "Before restore" manual snapshot, then `activeEditor.commands.setContent(snapshot.contentHtml)` — one confirm dialog, one write path.
- **Status:** Implemented. typecheck + eslint clean, prod build passes.

### Auto-snapshot must skip identical content
- **Found (design):** Yjs `update` events fire for remote/collaborator changes and formatting-only churn, so a naive counter would bank duplicate snapshots.
- **Why:** Snapshot identity is HTML text; without a dedupe check the list fills with byte-identical "auto-saves".
- **Fix:** `capture()` returns null when the editor HTML equals the newest stored version's `contentHtml`; also skips empty/placeholder-only docs. Policy: snapshot after ≥30 updates AND ≥5 min since the last auto-save, plus a flush on page switch and a "First version" baseline for pages with no history.
- **Status:** Implemented. Store capped at 50 versions per page (`folio-history-<pageId>`), oldest evicted.

## 2026-10-15 — phase2: public page sharing

### `getSchemaByResolvedExtensions` needs flattened extensions; ESM build omits `ExtensionManager`
- **Found:** First draft of `renderFragmentHtml` called `getSchemaByResolvedExtensions([StarterKit.configure(...), ...])` and crashed with "Schema is missing its top node type ('doc')" — StarterKit's children (Document, Paragraph, …) were never flattened. Switching to `ExtensionManager.resolve()` then failed differently: `The requested module '@tiptap/core' does not provide an export named 'ExtensionManager'` — the ESM bundle's export list omits it even though the `.d.ts` declares it.
- **Why:** The helper's name says "resolved" — it expects the already-flattened list the Editor builds internally; and tiptap's ESM/CJS export lists drift from their types.
- **Fix:** Use `getSchema()` from `@tiptap/core`, which does `ExtensionManager.resolve()` + `getSchemaByResolvedExtensions()` internally and is properly exported from both bundles.
- **Status:** Fixed before commit. Verified by rendering seed HTML to a string in a jsdom-backed test (headings, lists, toggles, images all serialize).

### ProseMirror `DOMParser` has no `parseFromString`
- **Found:** `tsc` error TS2339 — prosemirror-model's `DOMParser` exposes `parse(dom)`, not `parseFromString(string)`.
- **Why:** Reached for the browser API name out of habit; ProseMirror parses DOM nodes.
- **Fix:** Build a detached `<div>`, set `innerHTML`, and `DOMParser.fromSchema(schema).parse(container)`. Documented in the helper's comment.
- **Status:** Fixed before commit. Typecheck clean.

### Design: public links are same-device until the sync server exists
- **Found (design):** Yjs docs are in-memory per session and share records are in localStorage — a `#/p/<id>` link opened in another browser finds no document and no share.
- **Why:** Folio is local-first with no server; there is nowhere to resolve a public id remotely.
- **Fix:** The share dialog and the URL scheme are built for the future server (`#/p/<publicId>`, unguessable token, never the page id), and the UI says so honestly: "Public links work on this device — a sync server enables true public sharing." Recorded as the sharing contract, same as the attachment quota entry.
- **Status:** Implemented. Not a bug — recorded as the sharing contract.

### Design: disabled shares keep their token
- **Found (design):** Deleting the share record on unpublish would orphan the public id; re-publishing would mint a new link and break anyone holding the old one.
- **Why:** "Publish to web" reads as a toggle, not a destructive action.
- **Fix:** `disableSharing` sets `enabled: false` and keeps the token; `enableSharing` on an existing record reuses the public id. `getPageByPublicId` returns disabled records too, so the public route can distinguish "never existed" from "publishing turned off" with a specific message for each.
- **Status:** Implemented. Covered by the store unit tests (disable → re-enable reuses token).
