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
import { seedPages, seedContent } from './data/seed';
import type { FolioPage, FolioIdentity } from './types';

const SYNC_URL =
  typeof import.meta !== 'undefined'
    ? (import.meta.env.VITE_SYNC_URL as string | undefined)
    : undefined;

const CURSOR_COLORS = ['#2e5bff', '#e11d48', '#059669', '#d97706', '#7c3aed', '#0891b2'];

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

function pageIdFromHash(): string | null {
  const match = window.location.hash.match(/^#\/([\w-]+)$/);
  return match ? match[1]! : null;
}

/**
 * App — the Folio workspace shell.
 *
 * Owns the page tree, one Yjs document per page, the optional realtime
 * provider, theme, and the share dialog. The editor itself lives in
 * @folio/editor; sync primitives in @folio/sync.
 */
export function App() {
  const [pages, setPages] = useState<FolioPage[]>(seedPages);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => pageIdFromHash() ?? seedPages[0]?.id ?? null,
  );
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

  // Deep-link the open page
  useEffect(() => {
    window.location.hash = selectedId ? `#/${selectedId}` : '';
  }, [selectedId]);

  const selectedPage = pages.find((p) => p.id === selectedId) ?? null;

  const handleNewPage = useCallback((parentId: string | null) => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `page-${Date.now()}`;
    setPages((prev) => [
      ...prev,
      { id, title: '', icon: '📄', parentId, updatedAt: Date.now() },
    ]);
    setSelectedId(id);
  }, []);

  const handleRename = useCallback((id: string, title: string) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, title } : p)));
  }, []);

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
        selectedId={selectedId}
        onSelect={setSelectedId}
        onNewPage={handleNewPage}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          page={selectedPage}
          onTitleChange={handleRename}
          dark={dark}
          onToggleDark={() => setDark((d) => !d)}
          syncConnected={syncConnected}
          onShare={() => setShareOpen(true)}
        />

        <main className="folio-scroll folio-enter-content min-h-0 flex-1 overflow-y-auto">
          {selectedPage ? (
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
        </main>
      </div>

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
            Folio links are local-first. Without a sync server, the link opens the
            page shell on this device.
          </p>
        </ModalContent>
      </ModalRoot>
    </div>
  );
}
