import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Doc as YDoc } from 'yjs';
import type { WebsocketProvider } from 'y-websocket';
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
import { CommandPalette } from './components/CommandPalette';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ContentSkeleton } from './components/ContentSkeleton';
import { useShortcuts } from './hooks/useShortcuts';
import { seedPages, seedContent, seedDatabases } from './data/seed';
import type { FolioPage, FolioIdentity } from './types';
import type { DatabaseView, FolioDatabase } from './database-types';
import { newDbId } from './database-types';

const SYNC_URL =
  typeof import.meta !== 'undefined'
    ? (import.meta.env.VITE_SYNC_URL as string | undefined)
    : undefined;

const CURSOR_COLORS = ['#2e5bff', '#e11d48', '#059669', '#d97706', '#7c3aed', '#0891b2'];
const DATABASES_KEY = 'folio-databases';

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

  const selectPage = useCallback((id: string) => {
    setSelectedId(id);
    setSelectedDbId(null);
  }, []);

  const selectDatabase = useCallback((id: string) => {
    setSelectedDbId(id);
    setSelectedId(null);
  }, []);

  const handleNewPage = useCallback(
    (parentId: string | null) => {
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `page-${Date.now()}`;
      setPages((prev) => [...prev, { id, title: '', icon: '📄', parentId, updatedAt: Date.now() }]);
      selectPage(id);
    },
    [selectPage],
  );

  const togglePalette = useCallback(() => setPaletteOpen((open) => !open), []);
  const toggleDark = useCallback(() => setDark((d) => !d), []);
  const newTopLevelPage = useCallback(() => handleNewPage(null), [handleNewPage]);
  useShortcuts({
    onCommandPalette: togglePalette,
    onNewPage: newTopLevelPage,
    onToggleDark: toggleDark,
  });

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

  const handleNewDatabase = useCallback(() => {
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
      updatedAt: Date.now(),
    };
    setDatabases((prev) => [...prev, db]);
    selectDatabase(db.id);
  }, [selectDatabase]);

  const handleDatabaseChange = useCallback((db: FolioDatabase) => {
    setDatabases((prev) => prev.map((d) => (d.id === db.id ? db : d)));
  }, []);

  const handleDatabaseTitleChange = useCallback((id: string, title: string) => {
    setDatabases((prev) => prev.map((d) => (d.id === id ? { ...d, title } : d)));
  }, []);

  const handleViewChange = useCallback(
    (view: DatabaseView) => {
      if (!selectedDbId) return;
      setDatabases((prev) => prev.map((d) => (d.id === selectedDbId ? { ...d, view } : d)));
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
        onNewDatabase={handleNewDatabase}
      />

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
                ) : (
                  <DatabaseKanban
                    key={selectedDb.id}
                    database={selectedDb}
                    onChange={handleDatabaseChange}
                  />
                )}
              </div>
            ) : selectedPage ? (
              <div className="mx-auto w-full max-w-3xl px-8 pb-32 pt-10 md:px-12">
                <FolioEditor
                  key={selectedPage.id}
                  ydoc={getDoc(selectedPage.id)}
                  provider={provider}
                  user={identity}
                  initialHtml={seedContent[selectedPage.id]}
                />
              </div>
            ) : (
              <EmptyState onNewPage={() => handleNewPage(null)} />
            )}
          </ErrorBoundary>
        </main>
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
