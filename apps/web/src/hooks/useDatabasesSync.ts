import { useCallback, useEffect, useRef, useState } from 'react';
import type { SetStateAction } from 'react';
import type { Doc as YDoc } from 'yjs';
import { createSyncProvider, type FolioSyncProvider } from '@folio/sync/provider';
import type { FolioDatabase } from '../database-types';
import type { FolioIdentity } from '../types';
import { seedDatabases } from '../data/seed';
import {
  DATABASES_DOC_GUID,
  areDatabasesEmpty,
  createDatabasesDoc,
  readDatabases,
  subscribeDatabases,
  writeDatabases,
} from '../database-sync';

const SYNC_URL =
  typeof import.meta !== 'undefined'
    ? (import.meta.env.VITE_SYNC_URL as string | undefined)
    : undefined;

/** localStorage remains the offline backup: written through on every change. */
const DATABASES_KEY = 'folio-databases';
/** How long to wait for the server's initial sync before seeding from backup. */
const SYNC_WAIT_MS = 3000;

function loadCachedDatabases(): FolioDatabase[] | null {
  try {
    const raw = localStorage.getItem(DATABASES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FolioDatabase[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* fall through to seed */
  }
  return null;
}

const snapshotsEqual = (a: FolioDatabase[], b: FolioDatabase[]): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Databases backed by a Yjs document instead of useState + localStorage.
 *
 * - One document (`folio:databases` room) holds every database; Yjs is the
 *   single source of truth and React state mirrors it.
 * - Migration on first load: if the document is empty, the localStorage
 *   backup is imported; when there is no backup, the seed databases are
 *   written in. With a sync server configured, the hook waits for the
 *   initial server sync (or a timeout) before deciding the document is
 *   empty, so a fresh client never clobbers a shared workspace.
 * - Local edits write into the document; the subscription (debounced) folds
 *   both local and remote updates back into React state. `setDatabases`
 *   accepts the same `SetStateAction` shape as the old useState setter, so
 *   callers are unchanged.
 * - localStorage is kept as a write-through offline cache.
 * - Everything works with no server: the local document plus the backup.
 */
export function useDatabasesSync(
  identity: FolioIdentity,
): [FolioDatabase[], (action: SetStateAction<FolioDatabase[]>) => void] {
  const docRef = useRef<YDoc | null>(null);
  const readyRef = useRef(false);
  const [databases, setDatabasesState] = useState<FolioDatabase[]>([]);
  const [ready, setReady] = useState(false);

  // Own the document, the migration, the subscription, and the provider.
  useEffect(() => {
    const doc = createDatabasesDoc();
    docRef.current = doc;
    let provider: FolioSyncProvider | null = null;
    let waitTimer: ReturnType<typeof setTimeout> | null = null;

    const publish = () => {
      const next = readDatabases(doc);
      setDatabasesState((prev) => (snapshotsEqual(prev, next) ? prev : next));
    };

    /** One-time: import backup/seed into an empty document, then publish. */
    const finishInit = () => {
      if (readyRef.current) return;
      readyRef.current = true;
      if (areDatabasesEmpty(doc)) {
        writeDatabases(doc, loadCachedDatabases() ?? seedDatabases);
      }
      publish();
      setReady(true);
    };

    if (SYNC_URL) {
      provider = createSyncProvider(doc, {
        url: SYNC_URL,
        room: `folio:${DATABASES_DOC_GUID}`,
        user: identity,
      });
      const onSync = (synced: boolean) => {
        if (synced) finishInit();
      };
      provider.provider.on('sync', onSync);
      // If the server never answers, start from the local backup anyway.
      waitTimer = setTimeout(finishInit, SYNC_WAIT_MS);
      const wrappedDestroy = provider.destroy.bind(provider);
      provider.destroy = () => {
        provider!.provider.off('sync', onSync);
        wrappedDestroy();
      };
    } else {
      finishInit();
    }

    const unsubscribe = subscribeDatabases(doc, (next) => {
      setDatabasesState((prev) => (snapshotsEqual(prev, next) ? prev : next));
    });

    return () => {
      unsubscribe();
      if (waitTimer !== null) clearTimeout(waitTimer);
      provider?.destroy();
      docRef.current = null;
      readyRef.current = false;
      doc.destroy();
    };
  }, [identity]);

  // Write-through offline cache of whatever the document currently holds.
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(DATABASES_KEY, JSON.stringify(databases));
    } catch {
      /* storage unavailable — the Yjs document is still authoritative */
    }
  }, [databases, ready]);

  /**
   * Drop-in replacement for the old useState setter. Local edits write to
   * the Yjs document (the source of truth); React state is updated
   * optimistically and converges through the subscription.
   */
  const setDatabases = useCallback((action: SetStateAction<FolioDatabase[]>) => {
    const doc = docRef.current;
    if (!doc || !readyRef.current) return;
    const current = readDatabases(doc);
    const next = typeof action === 'function' ? action(current) : action;
    if (next === current) return;
    doc.transact(() => writeDatabases(doc, next));
    setDatabasesState((prev) => (snapshotsEqual(prev, next) ? prev : next));
  }, []);

  return [databases, setDatabases];
}
