import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Doc as YDoc } from 'yjs';
import type { WebsocketProvider } from 'y-websocket';
import type { Editor } from '@tiptap/core';
import { History as HistoryIcon } from 'lucide-react';
import { FolioEditor } from '@folio/editor/editor';
import { createFolioDoc } from '@folio/sync/doc';
import { createSyncProvider, type FolioSyncProvider } from '@folio/sync/provider';
import { Button } from '@folio/ui/button';
import { ModalRoot, ModalContent, ModalTitle, ModalDescription } from '@folio/ui/modal';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { EmptyState } from './components/EmptyState';
import { DatabaseTable } from './components/DatabaseTable';
import { DatabaseKanban } from './components/DatabaseKanban';
import { DatabaseCalendar } from './components/DatabaseCalendar';
import { DatabaseGallery } from './components/DatabaseGallery';
import { CommandPalette } from './components/CommandPalette';
import { CommentsPanel } from './components/Comments';
import { PageHistory } from './components/PageHistory';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ContentSkeleton } from './components/ContentSkeleton';
import { TemplatePicker, type TemplateKind } from './components/TemplatePicker';
import { ImportDialog } from './components/ImportDialog';
import { useShortcuts } from './hooks/useShortcuts';
import { usePageHistory } from './hooks/usePageHistory';
import { formatVersionTime, type PageVersion } from './history';
import { seedPages, seedContent, seedDatabases } from './data/seed';
import {
  buildDatabaseFromTemplate,
  type PageTemplate,
  type DatabaseTemplate,
} from './data/templates';
import type { FolioPage, FolioIdentity } from './types';
import type { DatabaseView, FolioDatabase } from './database-types';
import { newDbId } from './database-types';
import {
  localCommentStore,
  newCommentId,
  authorFromIdentity,
  unresolvedCount,
  type CommentAnchor,
  type CommentDraft,
  type CommentThread,
} from './comments';

const SYNC_URL =
  typeof import.meta !== 'undefined'
    ? (import.meta.env.VITE_SYNC_URL as string | undefined)
    : undefined;

const CURSOR_COLORS = ['#2e5bff', '#e11d48', '#059669', '#d97706', '#7c3aed', '#0891b2'];
const DATABASES_KEY = 'folio-databases';

const collapseWhitespace = (s: string) => s.replace(/\s+/g, ' ').trim();

/** 0-based index of the top-level block containing the selection head. */
function blockIndexAtSelection(editor: Editor): number {
  const { selection, doc } = editor.state;
  let index = 0;
  let matched = false;
  doc.content.forEach((node, offset, i) => {
    if (
      !matched &&
      selection.$from.pos >= offset &&
      selection.$from.pos <= offset + node.nodeSize
    ) {
      index = i;
      matched = true;
    }
  });
  return index;
}

/**
 * The quote stored on a comment anchor: the selected text when there is a
 * selection, otherwise an excerpt of the block under the cursor.
 */
function quoteFromSelection(editor: Editor, blockIndex: number): string {
  const { state } = editor;
  const { selection } = state;
  if (!selection.empty) {
    return collapseWhitespace(state.doc.textBetween(selection.from, selection.to, ' ')).slice(
      0,
      200,
    );
  }
  return collapseWhitespace(state.doc.child(blockIndex).textContent).slice(0, 140);
}

/**
 * Re-resolve an anchor to a live block index. Prefers the block whose text
 * still contains the stored quote (survives inserts/deletes above it); falls
 * back to the creation-time index, clamped into range.
 */
function resolveAnchorIndex(editor: Editor, anchor: CommentAnchor): number {
  const { doc } = editor.state;
  const count = doc.childCount;
  if (count === 0) return 0;
  const needle = anchor.quote.trim().toLowerCase();
  if (needle) {
    let match = -1;
    doc.content.forEach((node, _offset, i) => {
      if (match === -1 && node.textContent.toLowerCase().includes(needle)) match = i;
    });
    if (match !== -1) return match;
  }
  return Math.min(Math.max(anchor.blockIndex, 0), count - 1);
}

function loadIdentity(): FolioIdentity {
  try {
    const raw = localStorage.getItem('folio-identity');
    if (raw) return JSON.parse(raw) as FolioIdentity;
  } catch {
    /* fall through */
  }
  const identity: FolioIdentity = {
    name: `Guest ${Math.floor(Math.random() * 900 + 100)}`,
    color: CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)]!,
  };
  try {
    localStorage.setItem('folio-identity', JSON.stringify(identity));
  } catch {
    /* storage unavailable — session-only identity */
  }
  return identity;
}

function loadDatabases(): FolioDatabase[] {
  try {
    const raw = localStorage.getItem(DATABASES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FolioDatabase[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* fall through to seed */
  }
  return seedDatabases;
}

/** Deep-link: `#/db/<id>` selects a database, `#/<id>` selects a page. */
function selectionFromHash(): { pageId: string | null; dbId: string | null } {
  const dbMatch = window.location.hash.match(/^#\/db\/([\w-]+)$/);
  if (dbMatch) return { pageId: null, dbId: dbMatch[1]! };
  const pageMatch = window.location.hash.match(/^#\/([\w-]+)$/);
  return { pageId: pageMatch ? pageMatch[1]! : null, dbId: null };
}

/**
 * App — the Folio workspace shell.
 *
 * Owns the page tree, the databases, one Yjs document per page, the optional
 * realtime provider, theme, and the share dialog. The editor itself lives in
 * @folio/editor; sync primitives in @folio/sync.
 */
export function App() {
  const [pages, setPages] = useState<FolioPage[]>(seedPages);
  const [databases, setDatabases] = useState<FolioDatabase[]>(loadDatabases);
  const [initialSelection] = useState(selectionFromHash);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => initialSelection.pageId ?? seedPages[0]?.id ?? null,
  );
  const [selectedDbId, setSelectedDbId] = useState<string | null>(() => initialSelection.dbId);
  const [dark, setDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem('folio-theme') === 'dark';
    } catch {
      return false;
    }
  });
  const [shareOpen, setShareOpen] = useState(false);
  const [syncConnected, setSyncConnected] = useState<boolean | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [templatePicker, setTemplatePicker] = useState<TemplateKind | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  // Block-level comments for the open page.
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState<CommentDraft | null>(null);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  // Version history for the open page.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<PageVersion | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<PageVersion | null>(null);
  // initialHtml for pages created from a template or an import, keyed by page id.
  // FolioEditor writes it into the Yjs doc on first open (same as seed content).
  const initialHtmlRef = useRef(new Map<string, string>());
  // Brief shimmer while the editor area swaps to a newly selected doc.
  const [switching, setSwitching] = useState(false);
  const firstRenderRef = useRef(true);

  const docsRef = useRef(new Map<string, YDoc>());
  const syncRef = useRef<FolioSyncProvider | null>(null);
  const identity = useMemo(loadIdentity, []);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);

  const getDoc = useCallback((id: string): YDoc => {
    let doc = docsRef.current.get(id);
    if (!doc) {
      doc = createFolioDoc(`folio-page-${id}`);
      docsRef.current.set(id, doc);
    }
    return doc;
  }, []);

  // Imperative handle for the live editor, shared with the history hook so
  // snapshots read the current HTML — and restores write back through the
  // editor, never by touching the Yjs doc directly.
  const historyEditorRef = useRef<Editor | null>(null);
  const pageHistory = usePageHistory(
    selectedId,
    selectedId ? getDoc(selectedId) : null,
    identity,
    historyEditorRef,
  );

  // One realtime room per open page. No server configured → fully offline.
  useEffect(() => {
    syncRef.current?.destroy();
    syncRef.current = null;
    setProvider(null);
    setSyncConnected(null);
    if (!SYNC_URL || !selectedId) return;

    const handle = createSyncProvider(getDoc(selectedId), {
      url: SYNC_URL,
      room: `folio:${selectedId}`,
      user: identity,
    });
    syncRef.current = handle;
    setProvider(handle.provider);
    const off = handle.onStatus(setSyncConnected);
    return () => {
      off();
      handle.destroy();
      if (syncRef.current === handle) syncRef.current = null;
    };
  }, [selectedId, getDoc, identity]);

  // Theme
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('folio-theme', dark ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  }, [dark]);

  // Persist databases
  useEffect(() => {
    try {
      localStorage.setItem(DATABASES_KEY, JSON.stringify(databases));
    } catch {
      /* storage unavailable */
    }
  }, [databases]);

  // Load this page's comment threads; drop any draft when the page changes.
  useEffect(() => {
    setCommentDraft(null);
    setThreads(selectedId ? localCommentStore.list(selectedId) : []);
  }, [selectedId]);

  // Persist comment threads per page.
  useEffect(() => {
    if (!selectedId) return;
    localCommentStore.save(selectedId, threads);
  }, [threads, selectedId]);

  // Deep-link the open page or database
  useEffect(() => {
    window.location.hash = selectedDbId
      ? `#/db/${selectedDbId}`
      : selectedId
        ? `#/${selectedId}`
        : '';
  }, [selectedId, selectedDbId]);

  const selectedPage = selectedDbId ? null : (pages.find((p) => p.id === selectedId) ?? null);
  const selectedDb = databases.find((d) => d.id === selectedDbId) ?? null;

  // Paint comment markers on blocks carrying unresolved threads.
  useEffect(() => {
    if (!activeEditor || !selectedPage) return;
    const indices = new Set<number>();
    for (const thread of threads) {
      if (!thread.resolved) indices.add(resolveAnchorIndex(activeEditor, thread.anchor));
    }
    activeEditor.commands.setCommentedBlocks([...indices]);
  }, [threads, activeEditor, selectedPage]);

  const selectPage = useCallback(
    (id: string) => {
      // Bank pending edits as an auto-save before the page unmounts.
      pageHistory.flushAutoSnapshot();
      setPreviewVersion(null);
      setSelectedId(id);
      setSelectedDbId(null);
    },
    [pageHistory],
  );

  const selectDatabase = useCallback(
    (id: string) => {
      pageHistory.flushAutoSnapshot();
      setPreviewVersion(null);
      setSelectedDbId(id);
      setSelectedId(null);
    },
    [pageHistory],
  );

  const handleNewPage = useCallback(
    (parentId: string | null, template?: PageTemplate | null) => {
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `page-${Date.now()}`;
      if (template) {
        initialHtmlRef.current.set(id, template.initialHtml);
      }
      setPages((prev) => [
        ...prev,
        {
          id,
          title: template?.name ?? '',
          icon: template?.icon ?? '📄',
          parentId,
          updatedAt: Date.now(),
        },
      ]);
      selectPage(id);
    },
    [selectPage],
  );

  const togglePalette = useCallback(() => setPaletteOpen((open) => !open), []);
  const toggleDark = useCallback(() => setDark((d) => !d), []);
  const newTopLevelPage = useCallback(() => handleNewPage(null), [handleNewPage]);
  // Brief shimmer on page/database switch to smooth the editor transition.
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    setSwitching(true);
    const timer = window.setTimeout(() => setSwitching(false), 150);
    return () => window.clearTimeout(timer);
  }, [selectedId, selectedDbId]);

  const handleRename = useCallback((id: string, title: string) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, title } : p)));
  }, []);

  const handleNewDatabase = useCallback(
    (template?: DatabaseTemplate | null) => {
      if (template) {
        const db = buildDatabaseFromTemplate(template);
        setDatabases((prev) => [...prev, db]);
        selectDatabase(db.id);
        return;
      }
      const statusPropId = newDbId('prop');
      const db: FolioDatabase = {
        id: newDbId('db'),
        title: '',
        icon: '🗂️',
        properties: [
          { id: newDbId('prop'), name: 'Name', type: 'text' },
          {
            id: statusPropId,
            name: 'Status',
            type: 'select',
            options: ['Todo', 'Doing', 'Done'],
          },
        ],
        rows: [],
        view: 'table',
        kanbanGroupBy: statusPropId,
        calendarDateProp: null,
        updatedAt: Date.now(),
      };
      setDatabases((prev) => [...prev, db]);
      selectDatabase(db.id);
    },
    [selectDatabase],
  );

  /** Page created from an import: title + parsed HTML from the importer. */
  const handleImportPage = useCallback(
    (title: string, html: string) => {
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `page-${Date.now()}`;
      initialHtmlRef.current.set(id, html);
      setPages((prev) => [
        ...prev,
        { id, title, icon: '📥', parentId: null, updatedAt: Date.now() },
      ]);
      selectPage(id);
    },
    [selectPage],
  );

  /** Database created from a CSV import (already built by the importer). */
  const handleImportDatabase = useCallback(
    (db: FolioDatabase) => {
      setDatabases((prev) => [...prev, db]);
      selectDatabase(db.id);
    },
    [selectDatabase],
  );

  const handleDatabaseChange = useCallback((db: FolioDatabase) => {
    setDatabases((prev) => prev.map((d) => (d.id === db.id ? db : d)));
  }, []);

  const handleDatabaseTitleChange = useCallback((id: string, title: string) => {
    setDatabases((prev) => prev.map((d) => (d.id === id ? { ...d, title } : d)));
  }, []);

  const handleViewChange = useCallback(
    (view: DatabaseView) => {
      if (!selectedDbId) return;
      setDatabases((prev) =>
        prev.map((d) => {
          if (d.id !== selectedDbId) return d;
          const next: FolioDatabase = { ...d, view };
          // First time the calendar is selected, drive it by the first date property.
          if (view === 'calendar' && (next.calendarDateProp ?? null) === null) {
            next.calendarDateProp = d.properties.find((p) => p.type === 'date')?.id ?? null;
          }
          return next;
        }),
      );
    },
    [selectedDbId],
  );

  const handleCopyLink = useCallback(async () => {
    if (!selectedId) return;
    const url = `${window.location.origin}${window.location.pathname}#/${selectedId}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, [selectedId]);

  /** Capture the current block/selection as a comment anchor and open the composer. */
  const handleAddComment = useCallback(() => {
    if (!selectedPage || !activeEditor) return;
    const blockIndex = blockIndexAtSelection(activeEditor);
    setCommentDraft({ blockIndex, quote: quoteFromSelection(activeEditor, blockIndex) });
    setCommentsOpen(true);
  }, [selectedPage, activeEditor]);

  const handleCreateThread = useCallback(
    (text: string) => {
      if (!selectedPage || !commentDraft) return;
      const thread: CommentThread = {
        id: newCommentId(),
        pageId: selectedPage.id,
        anchor: { ...commentDraft },
        author: authorFromIdentity(identity),
        text,
        createdAt: Date.now(),
        resolved: false,
        replies: [],
      };
      setThreads((prev) => [thread, ...prev]);
      setCommentDraft(null);
    },
    [selectedPage, commentDraft, identity],
  );

  const handleAddReply = useCallback(
    (threadId: string, text: string) => {
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                replies: [
                  ...thread.replies,
                  {
                    id: newCommentId(),
                    author: authorFromIdentity(identity),
                    text,
                    createdAt: Date.now(),
                  },
                ],
              }
            : thread,
        ),
      );
    },
    [identity],
  );

  const handleToggleResolve = useCallback((threadId: string) => {
    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === threadId ? { ...thread, resolved: !thread.resolved } : thread,
      ),
    );
  }, []);

  const handleDeleteThread = useCallback((threadId: string) => {
    setThreads((prev) => prev.filter((thread) => thread.id !== threadId));
  }, []);

  /** Scroll the editor to a thread's anchored block and flash it. */
  const handleFocusThread = useCallback(
    (thread: CommentThread) => {
      if (!activeEditor) return;
      const index = resolveAnchorIndex(activeEditor, thread.anchor);
      let pos = 0;
      activeEditor.state.doc.content.forEach((_node, offset, i) => {
        if (i === index) pos = offset;
      });
      const dom = activeEditor.view.nodeDOM(pos);
      if (!(dom instanceof HTMLElement)) return;
      dom.scrollIntoView({ behavior: 'smooth', block: 'center' });
      dom.classList.add('folio-comment-flash');
      window.setTimeout(() => dom.classList.remove('folio-comment-flash'), 1600);
      activeEditor.commands.focus();
    },
    [activeEditor],
  );

  useShortcuts({
    onCommandPalette: togglePalette,
    onNewPage: newTopLevelPage,
    onToggleDark: toggleDark,
    onAddComment: handleAddComment,
  });

  /**
   * Restore a version. The current content is banked as a manual version
   * first, then the snapshot is written back through the live TipTap editor —
   * Collaboration turns it into Yjs updates, so sync partners see the
   * restore exactly like any other edit.
   */
  const handleConfirmRestore = useCallback(() => {
    if (!restoreTarget || !activeEditor) return;
    pageHistory.saveManualVersion('Before restore');
    activeEditor.commands.setContent(restoreTarget.contentHtml);
    setPreviewVersion(null);
    setRestoreTarget(null);
  }, [restoreTarget, activeEditor, pageHistory]);

  return (
    <div className="flex h-full bg-paper text-ink">
      <Sidebar
        pages={pages}
        selectedId={selectedDbId ? null : selectedId}
        onSelect={selectPage}
        onNewPage={handleNewPage}
        databases={databases}
        selectedDbId={selectedDbId}
        onSelectDatabase={selectDatabase}
        onTemplatePicker={setTemplatePicker}
        onImport={() => setImportOpen(true)}
      />

      <div className="flex min-w-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            doc={selectedDb ?? selectedPage}
            onTitleChange={selectedDb ? handleDatabaseTitleChange : handleRename}
            databaseView={selectedDb ? selectedDb.view : null}
            onViewChange={handleViewChange}
            dark={dark}
            onToggleDark={() => setDark((d) => !d)}
            syncConnected={syncConnected}
            onShare={() => setShareOpen(true)}
            canShare={selectedPage !== null}
            commentCount={unresolvedCount(threads)}
            commentsOpen={commentsOpen}
            onToggleComments={() => setCommentsOpen((open) => !open)}
            onAddComment={handleAddComment}
            showComments={selectedPage !== null}
            showHistory={selectedPage !== null}
            historyOpen={historyOpen}
            onToggleHistory={() => setHistoryOpen((open) => !open)}
          />

          <main className="folio-scroll folio-enter-content min-h-0 flex-1 overflow-y-auto">
            <ErrorBoundary>
              {switching ? (
                <ContentSkeleton />
              ) : selectedDb ? (
                <div className="mx-auto w-full max-w-5xl px-8 pb-32 pt-8">
                  {selectedDb.view === 'table' ? (
                    <DatabaseTable
                      key={selectedDb.id}
                      database={selectedDb}
                      onChange={handleDatabaseChange}
                    />
                  ) : selectedDb.view === 'kanban' ? (
                    <DatabaseKanban
                      key={selectedDb.id}
                      database={selectedDb}
                      onChange={handleDatabaseChange}
                    />
                  ) : selectedDb.view === 'calendar' ? (
                    <DatabaseCalendar
                      key={selectedDb.id}
                      database={selectedDb}
                      onChange={handleDatabaseChange}
                    />
                  ) : (
                    <DatabaseGallery
                      key={selectedDb.id}
                      database={selectedDb}
                      onChange={handleDatabaseChange}
                    />
                  )}
                </div>
              ) : selectedPage ? (
                <div className="mx-auto w-full max-w-3xl px-8 pb-32 pt-10 md:px-12">
                  {previewVersion && (
                    <>
                      <div
                        role="status"
                        className="glass-strong mb-6 flex flex-wrap items-center gap-2 rounded-control border border-hairline px-4 py-3 shadow-glass"
                      >
                        <HistoryIcon className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
                        <p className="min-w-0 flex-1 font-sans text-sm text-ink-soft">
                          Viewing version from {formatVersionTime(previewVersion.createdAt)} — “
                          {previewVersion.label}”
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPreviewVersion(null)}
                        >
                          Back to current
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setRestoreTarget(previewVersion)}
                        >
                          Restore
                        </Button>
                      </div>
                      <div
                        aria-label="Version preview (read-only)"
                        className="folio-prosemirror"
                        dangerouslySetInnerHTML={{ __html: previewVersion.contentHtml }}
                      />
                    </>
                  )}
                  {/* Kept mounted (hidden) during preview so restores go through the live editor. */}
                  <div className={previewVersion ? 'hidden' : undefined}>
                    <FolioEditor
                      key={selectedPage.id}
                      ydoc={getDoc(selectedPage.id)}
                      provider={provider}
                      user={identity}
                      onEditorChange={setActiveEditor}
                      editorRef={historyEditorRef}
                      initialHtml={
                        seedContent[selectedPage.id] ?? initialHtmlRef.current.get(selectedPage.id)
                      }
                    />
                  </div>
                </div>
              ) : (
                <EmptyState onNewPage={() => handleNewPage(null)} />
              )}
            </ErrorBoundary>
          </main>
        </div>

        {selectedPage && (
          <CommentsPanel
            open={commentsOpen}
            pageId={selectedPage.id}
            identity={identity}
            threads={threads}
            draft={commentDraft}
            onCancelDraft={() => setCommentDraft(null)}
            onCreateThread={handleCreateThread}
            onAddReply={handleAddReply}
            onToggleResolve={handleToggleResolve}
            onDeleteThread={handleDeleteThread}
            onFocusThread={handleFocusThread}
            onClose={() => setCommentsOpen(false)}
          />
        )}
        {selectedPage && (
          <PageHistory
            key={selectedPage.id}
            open={historyOpen}
            pageId={selectedPage.id}
            identity={identity}
            history={pageHistory}
            previewVersionId={previewVersion?.id ?? null}
            onPreview={setPreviewVersion}
            onClose={() => setHistoryOpen(false)}
          />
        )}
      </div>

      {/* Command palette */}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        pages={pages}
        databases={databases}
        onSelectPage={selectPage}
        onSelectDatabase={selectDatabase}
        onNewPage={newTopLevelPage}
        onNewDatabase={handleNewDatabase}
        dark={dark}
        onToggleDark={toggleDark}
      />

      {/* Template gallery */}
      {templatePicker && (
        <TemplatePicker
          kind={templatePicker}
          open
          onOpenChange={(open) => {
            if (!open) setTemplatePicker(null);
          }}
          onSelectPage={(template) => handleNewPage(null, template)}
          onSelectDatabase={(template) => handleNewDatabase(template)}
        />
      )}

      {/* Import dialog */}
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImportPage={handleImportPage}
        onImportDatabase={handleImportDatabase}
      />

      {/* Restore confirmation */}
      <ModalRoot open={restoreTarget !== null} onOpenChange={(open) => {
        if (!open) setRestoreTarget(null);
      }}>
        <ModalContent>
          <ModalTitle>Restore this version?</ModalTitle>
          <ModalDescription>
            {restoreTarget
              ? `The page will be replaced with “${restoreTarget.label}” from ${formatVersionTime(restoreTarget.createdAt)}. Your current content is saved as a version first, so nothing is lost.`
              : ''}
          </ModalDescription>
          <div className="mt-5 flex gap-2">
            <Button variant="ghost" onClick={() => setRestoreTarget(null)} className="flex-1">
              Cancel
            </Button>
            <Button variant="primary" onClick={handleConfirmRestore} className="flex-1">
              Restore this version
            </Button>
          </div>
        </ModalContent>
      </ModalRoot>

      {/* Share dialog */}
      <ModalRoot open={shareOpen} onOpenChange={setShareOpen}>
        <ModalContent>
          <ModalTitle>Share this page</ModalTitle>
          <ModalDescription>
            {syncConnected
              ? 'Anyone with the link sees this page live, cursors and all.'
              : 'Copy a link to this page. Realtime sharing needs the sync server running.'}
          </ModalDescription>
          <div className="mt-5 flex gap-2">
            <Button variant="primary" onClick={handleCopyLink} className="flex-1">
              {linkCopied ? 'Link copied' : 'Copy page link'}
            </Button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-faint">
            Folio links are local-first. Without a sync server, the link opens the page shell on
            this device.
          </p>
        </ModalContent>
      </ModalRoot>
    </div>
  );
}
