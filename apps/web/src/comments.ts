import type { FolioIdentity } from './types';

/** Who wrote a comment — mirrors FolioIdentity so identity stays the source of truth. */
export interface CommentAuthor {
  name: string;
  color: string;
}

/**
 * Where a comment lives. `blockIndex` is the 0-based top-level block index at
 * creation time; `quote` is the verbatim selected text (or a block excerpt) used
 * to re-resolve the anchor after edits move blocks around.
 */
export interface CommentAnchor {
  blockIndex: number;
  quote: string;
}

export interface CommentReply {
  id: string;
  author: CommentAuthor;
  text: string;
  createdAt: number;
}

export interface CommentThread {
  id: string;
  pageId: string;
  anchor: CommentAnchor;
  author: CommentAuthor;
  text: string;
  createdAt: number;
  resolved: boolean;
  replies: CommentReply[];
}

/** Anchor captured from the editor before the user writes the comment. */
export interface CommentDraft {
  blockIndex: number;
  quote: string;
}

export function authorFromIdentity(identity: FolioIdentity): CommentAuthor {
  return { name: identity.name, color: identity.color };
}

export function newCommentId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `comment-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export function unresolvedCount(threads: CommentThread[]): number {
  return threads.filter((thread) => !thread.resolved).length;
}

/**
 * Comment storage behind an interface so the localStorage implementation can
 * later be swapped for a Yjs-backed (or server-backed) store without touching
 * callers: threads are plain JSON, keyed by page.
 */
export interface CommentStore {
  list(pageId: string): CommentThread[];
  save(pageId: string, threads: CommentThread[]): void;
}

const keyFor = (pageId: string) => `folio-comments-${pageId}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAuthor(value: unknown): value is CommentAuthor {
  return isRecord(value) && typeof value.name === 'string' && typeof value.color === 'string';
}

function isReply(value: unknown): value is CommentReply {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isAuthor(value.author) &&
    typeof value.text === 'string' &&
    typeof value.createdAt === 'number'
  );
}

function isThread(value: unknown): value is CommentThread {
  if (!isRecord(value)) return false;
  const { anchor } = value;
  return (
    typeof value.id === 'string' &&
    typeof value.pageId === 'string' &&
    isRecord(anchor) &&
    typeof anchor.blockIndex === 'number' &&
    typeof anchor.quote === 'string' &&
    isAuthor(value.author) &&
    typeof value.text === 'string' &&
    typeof value.createdAt === 'number' &&
    typeof value.resolved === 'boolean' &&
    Array.isArray(value.replies) &&
    value.replies.every(isReply)
  );
}

export const localCommentStore: CommentStore = {
  list(pageId: string): CommentThread[] {
    try {
      const raw = localStorage.getItem(keyFor(pageId));
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isThread);
    } catch {
      return [];
    }
  },
  save(pageId: string, threads: CommentThread[]): void {
    try {
      localStorage.setItem(keyFor(pageId), JSON.stringify(threads));
    } catch {
      /* storage unavailable — comments stay session-only */
    }
  },
};
