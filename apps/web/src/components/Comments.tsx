import { useEffect, useRef, useState } from 'react';
import { X, Check, Undo2, Trash2, LocateFixed } from 'lucide-react';
import { Button } from '@folio/ui/button';
import { cn } from '@folio/ui/cn';
import type { FolioIdentity } from '../types';
import type { CommentDraft, CommentThread } from '../comments';
import { unresolvedCount } from '../comments';

export interface CommentsPanelProps {
  /** Rendered only when true; the panel unmounts when closed. */
  open: boolean;
  pageId: string;
  identity: FolioIdentity;
  threads: CommentThread[];
  /** Anchor captured from the editor, awaiting the user's message. */
  draft: CommentDraft | null;
  onCancelDraft: () => void;
  onCreateThread: (text: string) => void;
  onAddReply: (threadId: string, text: string) => void;
  onToggleResolve: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  /** Scroll the editor to the thread's anchored block and flash it. */
  onFocusThread: (thread: CommentThread) => void;
  onClose: () => void;
}

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
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

interface ComposerProps {
  autoFocus?: boolean;
  placeholder: string;
  submitLabel: string;
  onSubmit: (text: string) => void;
  onCancel?: () => void;
}

function Composer({ autoFocus, placeholder, submitLabel, onSubmit, onCancel }: ComposerProps) {
  const [value, setValue] = useState('');
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) areaRef.current?.focus();
  }, [autoFocus]);

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    onSubmit(text);
    setValue('');
  };

  return (
    <div>
      <textarea
        ref={areaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        rows={3}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full resize-y rounded-control border border-hairline bg-paper px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent/50 focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button variant="primary" size="sm" onClick={submit} disabled={!value.trim()}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

interface ThreadCardProps {
  thread: CommentThread;
  identity: FolioIdentity;
  onAddReply: (threadId: string, text: string) => void;
  onToggleResolve: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onFocusThread: (thread: CommentThread) => void;
}

function ThreadCard({
  thread,
  identity,
  onAddReply,
  onToggleResolve,
  onDeleteThread,
  onFocusThread,
}: ThreadCardProps) {
  const [replying, setReplying] = useState(false);
  const own = thread.author.name === identity.name;

  return (
    <article
      className={cn(
        'rounded-control border border-hairline bg-paper p-3 shadow-glass',
        thread.resolved && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-2">
        <AuthorDot name={thread.author.name} color={thread.author.color} />
        <span className="min-w-0 flex-1 truncate font-sans text-[13px] font-medium text-ink">
          {thread.author.name}
        </span>
        <span className="shrink-0 font-sans text-xs text-ink-faint">
          {timeAgo(thread.createdAt)}
        </span>
      </div>

      {thread.anchor.quote && (
        <button
          type="button"
          onClick={() => onFocusThread(thread)}
          title="Jump to this block in the editor"
          className="mt-2 block w-full border-l-2 border-amber-600/60 pl-2 text-left font-sans text-xs italic leading-relaxed text-ink-soft hover:text-ink"
        >
          <span className="line-clamp-2">“{thread.anchor.quote}”</span>
        </button>
      )}

      <p className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink">
        {thread.text}
      </p>

      {thread.replies.length > 0 && (
        <div className="mt-2 space-y-2 border-t border-hairline pt-2">
          {thread.replies.map((reply) => (
            <div key={reply.id} className="flex gap-2">
              <AuthorDot name={reply.author.name} color={reply.author.color} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate font-sans text-xs font-medium text-ink">
                    {reply.author.name}
                  </span>
                  <span className="shrink-0 font-sans text-[11px] text-ink-faint">
                    {timeAgo(reply.createdAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-ink-soft">
                  {reply.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {replying ? (
        <div className="mt-2">
          <Composer
            autoFocus
            placeholder="Write a reply…"
            submitLabel="Reply"
            onSubmit={(text) => {
              onAddReply(thread.id, text);
              setReplying(false);
            }}
            onCancel={() => setReplying(false)}
          />
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-1 border-t border-hairline pt-2">
          <Button variant="ghost" size="sm" onClick={() => setReplying(true)}>
            Reply
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onFocusThread(thread)}
            aria-label="Jump to this block in the editor"
          >
            <LocateFixed className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <span className="flex-1" />
          {own && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDeleteThread(thread.id)}
              aria-label="Delete this comment"
              className="text-ink-faint hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => onToggleResolve(thread.id)}>
            {thread.resolved ? (
              <>
                <Undo2 className="h-3.5 w-3.5" aria-hidden />
                Reopen
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden />
                Resolve
              </>
            )}
          </Button>
        </div>
      )}
    </article>
  );
}

/**
 * CommentsPanel — the right-rail thread list for the open page.
 *
 * Threads live in App state (persisted per page in localStorage via the
 * CommentStore interface); this panel is pure presentation plus the draft
 * composer for a freshly captured anchor.
 */
export function CommentsPanel({
  open,
  pageId,
  identity,
  threads,
  draft,
  onCancelDraft,
  onCreateThread,
  onAddReply,
  onToggleResolve,
  onDeleteThread,
  onFocusThread,
  onClose,
}: CommentsPanelProps) {
  if (!open) return null;

  const openThreads = threads.filter((t) => !t.resolved).sort((a, b) => b.createdAt - a.createdAt);
  const resolvedThreads = threads
    .filter((t) => t.resolved)
    .sort((a, b) => b.createdAt - a.createdAt);
  const openCount = unresolvedCount(threads);

  return (
    <aside
      key={pageId}
      aria-label="Comments"
      className="glass-strong flex h-full w-[21rem] shrink-0 flex-col border-l border-hairline"
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-4">
        <h2 className="font-display text-base text-ink">Comments</h2>
        {openCount > 0 && (
          <span className="rounded-full bg-accent-soft px-2 py-0.5 font-sans text-xs font-medium text-ink">
            {openCount} open
          </span>
        )}
        <span className="flex-1" />
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close comments">
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      <div className="folio-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {draft && (
          <div className="rounded-control border border-accent/30 bg-paper p-3 shadow-glass">
            <p className="mb-1 font-sans text-xs font-medium text-ink-soft">New comment</p>
            {draft.quote && (
              <p className="mb-2 line-clamp-2 border-l-2 border-amber-600/60 pl-2 font-sans text-xs italic leading-relaxed text-ink-soft">
                “{draft.quote}”
              </p>
            )}
            <Composer
              autoFocus
              placeholder="Write a comment…"
              submitLabel="Comment"
              onSubmit={onCreateThread}
              onCancel={onCancelDraft}
            />
          </div>
        )}

        {openThreads.length === 0 && resolvedThreads.length === 0 && !draft && (
          <div className="rounded-control border border-dashed border-hairline p-6 text-center">
            <p className="font-sans text-sm text-ink-soft">No comments yet.</p>
            <p className="mt-1 font-sans text-xs leading-relaxed text-ink-faint">
              Place the cursor in a block — or select text — and press{' '}
              <kbd className="rounded border border-hairline bg-paper-deep px-1 py-0.5 font-sans text-[11px] text-ink-soft">
                ⌘⇧M
              </kbd>{' '}
              to start a thread.
            </p>
          </div>
        )}

        {openThreads.map((thread) => (
          <ThreadCard
            key={thread.id}
            thread={thread}
            identity={identity}
            onAddReply={onAddReply}
            onToggleResolve={onToggleResolve}
            onDeleteThread={onDeleteThread}
            onFocusThread={onFocusThread}
          />
        ))}

        {resolvedThreads.length > 0 && (
          <div className="pt-1">
            <p className="mb-2 font-sans text-xs font-medium text-ink-faint">Resolved</p>
            <div className="space-y-3">
              {resolvedThreads.map((thread) => (
                <ThreadCard
                  key={thread.id}
                  thread={thread}
                  identity={identity}
                  onAddReply={onAddReply}
                  onToggleResolve={onToggleResolve}
                  onDeleteThread={onDeleteThread}
                  onFocusThread={onFocusThread}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
