import { Moon, Sun, Share2, Table, Kanban } from 'lucide-react';
import { Button } from '@folio/ui/button';
import type { DatabaseView } from '../database-types';
import { cn } from '@folio/ui/cn';

/** Anything with an editable title shown in the top bar — a page or a database. */
export interface TopBarDoc {
  id: string;
  title: string;
  icon: string;
}

export interface TopBarProps {
  doc: TopBarDoc | null;
  onTitleChange: (id: string, title: string) => void;
  /** Non-null when a database is open — renders the table/kanban switcher. */
  databaseView: DatabaseView | null;
  onViewChange: (view: DatabaseView) => void;
  dark: boolean;
  onToggleDark: () => void;
  /** null = no sync server configured; boolean = connection state. */
  syncConnected: boolean | null;
  onShare: () => void;
  /** Whether the share action applies to the open doc (pages only). */
  canShare: boolean;
}

const VIEW_OPTIONS: { view: DatabaseView; label: string; icon: typeof Table }[] = [
  { view: 'table', label: 'Table', icon: Table },
  { view: 'kanban', label: 'Kanban', icon: Kanban },
];

/**
 * TopBar — current doc identity, database view switcher, sync presence,
 * theme, and sharing. Floats over the content as frosted glass.
 */
export function TopBar({
  doc,
  onTitleChange,
  databaseView,
  onViewChange,
  dark,
  onToggleDark,
  syncConnected,
  onShare,
  canShare,
}: TopBarProps) {
  return (
    <header className="glass-strong flex h-14 shrink-0 items-center gap-3 border-b border-hairline px-5">
      {doc ? (
        <>
          <span className="text-xl leading-none" aria-hidden>
            {doc.icon}
          </span>
          <input
            value={doc.title}
            onChange={(e) => onTitleChange(doc.id, e.target.value)}
            placeholder="Untitled"
            aria-label="Title"
            className="folio-title-input font-display text-lg text-ink placeholder:text-ink-faint"
          />
        </>
      ) : (
        <span className="font-display text-lg text-ink-faint">Folio</span>
      )}

      {databaseView && (
        <div
          className="flex items-center gap-0.5 rounded-control border border-hairline bg-paper p-0.5"
          role="radiogroup"
          aria-label="Database view"
        >
          {VIEW_OPTIONS.map(({ view, label, icon: Icon }) => (
            <button
              key={view}
              role="radio"
              aria-checked={databaseView === view}
              onClick={() => onViewChange(view)}
              className={cn(
                'flex items-center gap-1.5 rounded-[0.4rem] px-2.5 py-1 font-sans text-xs font-medium',
                'transition-colors duration-quick ease-folio',
                databaseView === view
                  ? 'bg-accent-soft text-ink'
                  : 'text-ink-faint hover:text-ink',
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {/* Sync presence */}
        <span
          className="mr-1 flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-xs text-ink-soft"
          title={
            syncConnected === null
              ? 'Offline — no sync server configured'
              : syncConnected
                ? 'Connected to sync server'
                : 'Sync server unreachable — editing offline'
          }
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              syncConnected === null && 'bg-ink-faint',
              syncConnected === true && 'bg-green-500',
              syncConnected === false && 'bg-amber-500',
            )}
            aria-hidden
          />
          {syncConnected === null ? 'Offline' : syncConnected ? 'Live' : 'Offline'}
        </span>

        <Button
          variant="ghost"
          size="icon"
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={onToggleDark}
        >
          {dark ? (
            <Sun className="h-4 w-4" aria-hidden />
          ) : (
            <Moon className="h-4 w-4" aria-hidden />
          )}
        </Button>

        {canShare && (
          <Button variant="primary" size="sm" onClick={onShare}>
            <Share2 className="h-3.5 w-3.5" aria-hidden />
            Share
          </Button>
        )}
      </div>
    </header>
  );
}
