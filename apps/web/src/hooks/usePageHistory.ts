import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Doc as YDoc } from 'yjs';
import type { Editor } from '@tiptap/core';
import type { FolioIdentity } from '../types';
import {
  authorFromIdentity,
  buildVersion,
  htmlHasContent,
  localVersionStore,
  type PageVersion,
} from '../history';

/** Auto-save at most this often while editing is active. */
const AUTO_MIN_INTERVAL_MS = 5 * 60 * 1000;
/** …and only after this many Yjs updates since the previous auto-save. */
const AUTO_MIN_CHANGES = 30;
/** Baseline capture waits this long for the editor to hydrate seed/template HTML. */
const BASELINE_DELAY_MS = 1000;

export interface PageHistoryApi {
  /** Newest-first versions for the open page. */
  versions: PageVersion[];
  /** Capture the current editor content as a manual version. Returns it, or null if nothing to save. */
  saveManualVersion: (label?: string) => PageVersion | null;
  /**
   * Capture pending edits as an auto-save — call before the page unmounts
   * (e.g. page switch) so no work is lost between auto-save windows.
   */
  flushAutoSnapshot: () => PageVersion | null;
  reload: () => void;
}

/**
 * usePageHistory — snapshot lifecycle for one open page.
 *
 * Listens to the page's Yjs document and captures periodic auto-snapshots
 * (5 minutes of active editing, or 30 content changes — whichever the
 * content hits first), skips identical duplicates, and takes a "First
 * version" baseline when a page opens with no history yet. Reads HTML from
 * the live TipTap editor; restores go back through the editor so Yjs sync
 * is never bypassed.
 */
export function usePageHistory(
  pageId: string | null,
  ydoc: YDoc | null,
  identity: FolioIdentity,
  editorRef: RefObject<Editor | null>,
): PageHistoryApi {
  const [versions, setVersions] = useState<PageVersion[]>([]);

  // Latest values for the doc-update listener, which is registered once per page.
  const pageIdRef = useRef(pageId);
  pageIdRef.current = pageId;
  const ydocRef = useRef(ydoc);
  ydocRef.current = ydoc;
  const changesRef = useRef(0);
  const lastAutoAtRef = useRef(0);

  const reload = useCallback(() => {
    const id = pageIdRef.current;
    setVersions(id ? localVersionStore.list(id) : []);
  }, []);

  /**
   * Capture the editor's current HTML as a version. Returns the version, or
   * null when the page is closed, empty, or unchanged since the last capture.
   */
  const capture = useCallback(
    (kind: PageVersion['kind'], label?: string): PageVersion | null => {
      const id = pageIdRef.current;
      const editor = editorRef.current;
      if (!id || !editor) return null;
      const html = editor.getHTML();
      if (!htmlHasContent(html)) return null;
      const latest = localVersionStore.list(id)[0];
      if (latest && latest.contentHtml === html) return null;
      const version = buildVersion(id, html, authorFromIdentity(identity), kind, label);
      setVersions(localVersionStore.add(id, version));
      return version;
    },
    [editorRef, identity],
  );

  const saveManualVersion = useCallback(
    (label?: string): PageVersion | null => {
      const saved = capture('manual', label);
      if (saved) {
        // A manual save resets the auto-save cadence — the snapshot is fresh.
        lastAutoAtRef.current = Date.now();
        changesRef.current = 0;
      }
      return saved;
    },
    [capture],
  );

  const flushAutoSnapshot = useCallback((): PageVersion | null => {
    if (changesRef.current === 0) return null;
    const saved = capture('auto');
    if (saved) {
      lastAutoAtRef.current = Date.now();
      changesRef.current = 0;
    }
    return saved;
  }, [capture]);

  // Reset per-page counters and load the version list when the page changes.
  useEffect(() => {
    changesRef.current = 0;
    lastAutoAtRef.current = 0;
    setVersions(pageId ? localVersionStore.list(pageId) : []);
  }, [pageId]);

  // Baseline: a page opened with no history gets a "First version" snapshot
  // once the editor has hydrated (seed content, template, or import HTML).
  useEffect(() => {
    if (!pageId) return;
    const timer = window.setTimeout(() => {
      if (localVersionStore.list(pageId).length === 0) {
        capture('auto', 'First version');
      }
    }, BASELINE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pageId, capture]);

  // Auto-save cadence driven by Yjs updates.
  useEffect(() => {
    if (!pageId || !ydoc) return;
    const onUpdate = () => {
      changesRef.current += 1;
      if (
        changesRef.current >= AUTO_MIN_CHANGES &&
        Date.now() - lastAutoAtRef.current >= AUTO_MIN_INTERVAL_MS
      ) {
        const saved = capture('auto');
        if (saved) {
          lastAutoAtRef.current = Date.now();
          changesRef.current = 0;
        }
      }
    };
    ydoc.on('update', onUpdate);
    return () => {
      ydoc.off('update', onUpdate);
    };
  }, [pageId, ydoc, capture]);

  return { versions, saveManualVersion, flushAutoSnapshot, reload };
}
