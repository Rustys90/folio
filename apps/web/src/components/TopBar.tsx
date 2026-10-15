import { Moon, Sun, Share2 } from 'lucide-react';
import { Button } from '@folio/ui/button';
import type { FolioPage } from '../types';
import { cn } from '@folio/ui/cn';

export interface TopBarProps {
  page: FolioPage | null;
  onTitleChange: (id: string, title: string) => void;
  dark: boolean;
  onToggleDark: () => void;
  /** null = no sync server configured; boolean = connection state. */
  syncConnected: boolean | null;
  onShare: () => void;
}

/**
 * TopBar — current page identity, sync presence, theme, and sharing.
 * Floats over the content as frosted glass.
 */
export function TopBar({
  page,
  onTitleChange,
  dark,
  onToggleDark,
  syncConnected,
  onShare,
}: TopBarProps) {
  return (
    <header className="glass-strong flex h-14 shrink-0 items-center gap-3 border-b border-hairline px-5">
      {page ? (
        <>
          <span className="text-xl leading-none" aria-hidden>
            {page.icon}
          </span>
          <input
            value={page.title}
            onChange={(e) => onTitleChange(page.id, e.target.value)}
            placeholder="Untitled"
            aria-label="Page title"
            className="folio-title-input font-display text-lg text-ink placeholder:text-ink-faint"
          />
        </>
      ) : (
        <span className="font-display text-lg text-ink-faint">Folio</span>
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

        <Button variant="primary" size="sm" onClick={onShare}>
          <Share2 className="h-3.5 w-3.5" aria-hidden />
          Share
        </Button>
      </div>
    </header>
  );
}
