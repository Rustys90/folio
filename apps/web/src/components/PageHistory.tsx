import { useState } from 'react';
import { History, X, BookmarkPlus, RotateCcw } from 'lucide-react';
import { Button } from '@folio/ui/button';
import { cn } from '@folio/ui/cn';
import type { FolioIdentity } from '../types';
import type { PageHistoryApi } from '../hooks/usePageHistory';
import { formatVersionTime, type PageVersion } from '../history';

export interface PageHistoryProps {
  /** Rendered only when true; the panel unmounts when closed. */
  open: boolean;
  pageId: string;
  identity: FolioIdentity;
  history: PageHistoryApi;
  /** Id of the version currently shown in preview, if any. */
  previewVersionId: string | null;
  onPreview: (version: PageVersion | null) => void;
  onClose: () => void;
}

function AuthorDot({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-sans text-[10px] font-semibold text-white"
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function WordDelta({ words }: { words: number }) {
  if (words === 0) return null;
  const grown = words > 0;
  return (
    <span
      className={cn(
        'shrink-0 font-sans text-xs font-medium tabular-nums',
        grown ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
      )}
      title={`Word count ${grown ? 'grew' : 'shrank'} by ${Math.abs(words)} since the previous version`}
    >
      {grown ? '+' : '−'}
      {Math.abs(words)} words
    </span>
  );
}

interface VersionRowProps {
  version: PageVersion;
  identity: FolioIdentity;
  /** Word-count delta against the next older version; null for the oldest. */
  deltaWords: number | null;
  previewing: boolean;
  onPreview: (version: PageVersion) => void;
}

function VersionRow({ version, identity, deltaWords, previewing, onPreview }: VersionRowProps) {
  const own = version.author.name === identity.name;
  return (
    <button
      type="button"
      onClick={() => onPreview(version)}
      aria-current={previewing}
      className={cn(
        'block w-full rounded-control border p-3 text-left shadow-glass transition-colors duration-quick ease-folio',
        previewing
          ? 'border-accent/50 bg-accent-soft'
          : 'border-hairline bg-paper hover:border-accent/30 hover:bg-paper-deep',
      )}
    >
      <div className="flex items-center gap-2">
        <AuthorDot name={version.author.name} color={version.author.color} />
        <span className="min-w-0 flex-1 truncate font-sans text-[13px] font-medium text-ink">
          {version.label}
        </span>
        {version.kind === 'auto' ? (
          <span className="shrink-0 rounded-full bg-paper-deep px-2 py-0.5 font-sans text-[11px] text-ink-faint">
            Auto
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 font-sans text-[11px] font-medium text-ink">
            Saved
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2 pl-8">
        <span className="font-sans text-xs text-ink-faint">{formatVersionTime(version.createdAt)}</span>
        <span className="font-sans text-xs text-ink-faint" aria-hidden>
          ·
        </span>
        <span className="font-sans text-xs text-ink-faint">
          {own ? 'You' : version.author.name}
        </span>
        <span className="font-sans text-xs text-ink-faint" aria-hidden>
          ·
        </span>
        <span className="font-sans text-xs tabular-nums text-ink-faint">
          {version.wordCount} {version.wordCount === 1 ? 'word' : 'words'}
        </span>
        <span className="flex-1" />
        {deltaWords !== null && <WordDelta words={deltaWords} />}
      </div>
      {previewing && (
        <p className="mt-2 flex items-center gap-1.5 pl-8 font-sans text-xs font-medium text-accent">
          <RotateCcw className="h-3 w-3" aria-hidden />
          Previewing in the main area
        </p>
      )}
    </button>
  );
}

/**
 * PageHistory — the right-rail version list for the open page.
 *
 * Snapshot capture itself lives in usePageHistory (Yjs-update driven); this
 * panel is presentation plus the manual "save version" composer. Restores
 * run through the live TipTap editor in App, never by writing the Yjs doc
 * directly.
 */
export function PageHistory({
  open,
  pageId,
  identity,
  history,
  previewVersionId,
  onPreview,
  onClose,
}: PageHistoryProps) {
  const [label, setLabel] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  if (!open) return null;

  const { versions, saveManualVersion } = history;

  const handleSave = () => {
    const saved = saveManualVersion(label);
    if (saved) {
      setLabel('');
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2000);
    }
  };

  return (
    <aside
      key={pageId}
      aria-label="Page history"
      className="glass-strong flex h-full w-[21rem] shrink-0 flex-col border-l border-hairline"
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-4">
        <History className="h-4 w-4 text-ink-soft" aria-hidden />
        <h2 className="font-display text-base text-ink">Version history</h2>
        {versions.length > 0 && (
          <span className="rounded-full bg-accent-soft px-2 py-0.5 font-sans text-xs font-medium text-ink">
            {versions.length}
          </span>
        )}
        <span className="flex-1" />
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close version history">
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      <div className="shrink-0 border-b border-hairline p-4">
        <label
          htmlFor="history-label"
          className="mb-1.5 block font-sans text-xs font-medium text-ink-soft"
        >
          Save the current state as a named version
        </label>
        <input
          id="history-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSave();
            }
          }}
          placeholder="Label (optional) — e.g. Before the rewrite"
          className="w-full rounded-control border border-hairline bg-paper px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent/50 focus:outline-none"
        />
        <Button variant="secondary" size="sm" onClick={handleSave} className="mt-2 w-full">
          <BookmarkPlus className="h-3.5 w-3.5" aria-hidden />
          {savedFlash ? 'Version saved' : 'Save version now'}
        </Button>
        <p className="mt-2 font-sans text-[11px] leading-relaxed text-ink-faint">
          Folio also saves automatically while you edit. Click a version to preview it.
        </p>
      </div>

      <div className="folio-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
        {versions.length === 0 ? (
          <div className="rounded-control border border-dashed border-hairline p-6 text-center">
            <p className="font-sans text-sm text-ink-soft">No versions yet.</p>
            <p className="mt-1 font-sans text-xs leading-relaxed text-ink-faint">
              Write something and save a version, or keep editing — the first auto-save lands on
              its own.
            </p>
          </div>
        ) : (
          versions.map((version, index) => {
            const older = versions[index + 1] ?? null;
            return (
              <VersionRow
                key={version.id}
                version={version}
                identity={identity}
                deltaWords={older ? version.wordCount - older.wordCount : null}
                previewing={previewVersionId === version.id}
                onPreview={onPreview}
              />
            );
          })
        )}
      </div>
    </aside>
  );
}
