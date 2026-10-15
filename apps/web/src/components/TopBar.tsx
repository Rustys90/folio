import {
  Moon,
  Sun,
  Share2,
  Table,
  Kanban,
  Calendar,
  LayoutGrid,
  MessageSquare,
  MessageSquarePlus,
  History,
  Paperclip,
} from 'lucide-react';
import { Button } from '@folio/ui/button';
import type { DatabaseView } from '../database-types';
import { isMacPlatform } from '../hooks/useShortcuts';
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
  /** Unresolved comment count for the open page. */
  commentCount: number;
  /** Whether the comments panel is open. */
  commentsOpen: boolean;
  /** Toggle the comments panel. */
  onToggleComments: () => void;
  /** Start a comment on the current block/selection. */
  onAddComment: () => void;
  /** Comments apply to pages, not databases. */
  showComments: boolean;
  /** Whether the version-history toggle is shown (pages only). */
  showHistory: boolean;
  /** Whether the history panel is open. */
  historyOpen: boolean;
  /** Toggle the version-history panel. */
  onToggleHistory: () => void;
  /** Attachments apply to pages, not databases. */
  showAttachments: boolean;
  /** Whether the attachments panel is open. */
  attachmentsOpen: boolean;
  /** Toggle the attachments panel. */
  onToggleAttachments: () => void;
  /** Attachment count for the open page. */
  attachmentCount: number;
}

const VIEW_OPTIONS: { view: DatabaseView; label: string; icon: typeof Table }[] = [
  { view: 'table', label: 'Table', icon: Table },
  { view: 'kanban', label: 'Kanban', icon: Kanban },
  { view: 'calendar', label: 'Calendar', icon: Calendar },
  { view: 'gallery', label: 'Gallery', icon: LayoutGrid },
];

/**
 * TopBar — current doc identity, database view switcher, sync presence,
 * comments/history/attachments toggles, theme, and sharing. Floats over the
 * content as frosted glass.
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
  commentCount,
  commentsOpen,
  onToggleComments,
  onAddComment,
  showComments,
  showHistory,
  historyOpen,
  onToggleHistory,
  showAttachments,
  attachmentsOpen,
  onToggleAttachments,
  attachmentCount,
}: TopBarProps) {
  const commentHint = isMacPlatform() ? '⌘⇧M' : 'Ctrl+Shift+M';
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
                databaseView === view ? 'bg-accent-soft text-ink' : 'text-ink-faint hover:text-ink',
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

        {showComments && (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Add comment"
              title={`Add comment (${commentHint})`}
              onClick={onAddComment}
            >
              <MessageSquarePlus className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={
                commentsOpen
                  ? 'Close comments'
                  : `Open comments${commentCount > 0 ? ` (${commentCount} open)` : ''}`
              }
              aria-pressed={commentsOpen}
              title="Comments"
              onClick={onToggleComments}
              className="relative"
            >
              <MessageSquare className="h-4 w-4" aria-hidden />
              {commentCount > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-sans text-[10px] font-semibold text-accent-ink"
                  aria-hidden
                >
                  {commentCount > 99 ? '99+' : commentCount}
                </span>
              )}
            </Button>
          </>
        )}

        {showHistory && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={historyOpen ? 'Close version history' : 'Open version history'}
            aria-pressed={historyOpen}
            title="Version history"
            onClick={onToggleHistory}
          >
            <History className="h-4 w-4" aria-hidden />
          </Button>
        )}

        {showAttachments && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              attachmentsOpen
                ? 'Close attachments'
                : `Open attachments${attachmentCount > 0 ? ` (${attachmentCount})` : ''}`
            }
            aria-pressed={attachmentsOpen}
            title="Attachments"
            onClick={onToggleAttachments}
            className="relative"
          >
            <Paperclip className="h-4 w-4" aria-hidden />
            {attachmentCount > 0 && (
              <span
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-sans text-[10px] font-semibold text-accent-ink"
                aria-hidden
              >
                {attachmentCount > 99 ? '99+' : attachmentCount}
              </span>
            )}
          </Button>
        )}

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
