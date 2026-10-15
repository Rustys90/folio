import type { FolioIdentity } from './types';

/** Who captured a version — mirrors FolioIdentity so identity stays the source of truth. */
export interface VersionAuthor {
  name: string;
  color: string;
}

/** One captured state of a page's content. */
export interface PageVersion {
  id: string;
  pageId: string;
  createdAt: number;
  /** 'manual' = user pressed "Save version"; 'auto' = the editor captured it. */
  kind: 'manual' | 'auto';
  /** Human label: the user's own text for manual saves, a generated name for autos. */
  label: string;
  author: VersionAuthor;
  /** TipTap-serialized HTML of the page at capture time. */
  contentHtml: string;
  /** Word count at capture time, cached so the list never re-parses HTML. */
  wordCount: number;
}

export function authorFromIdentity(identity: FolioIdentity): VersionAuthor {
  return { name: identity.name, color: identity.color };
}

export function newVersionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `version-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/** Hard cap per page — the oldest versions are evicted past this. */
export const MAX_VERSIONS_PER_PAGE = 50;

const keyFor = (pageId: string) => `folio-history-${pageId}`;

/** Count words in serialized HTML without a DOM parse. */
export function wordCountOf(html: string): number {
  if (!html) return 0;
  const text = html
    // Keep block boundaries from turning into glued words.
    .replace(/<\/(p|h[1-6]|li|div|blockquote|pre|tr|ul|ol)>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return 0;
  return text.split(' ').length;
}

/** Empty or placeholder-only content never becomes a version. */
export function htmlHasContent(html: string): boolean {
  return wordCountOf(html) > 0;
}

/** "5m ago" style timestamps, newest first in the list. */
export function formatVersionTime(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isVersion(value: unknown): value is PageVersion {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.pageId === 'string' &&
    typeof value.createdAt === 'number' &&
    (value.kind === 'manual' || value.kind === 'auto') &&
    typeof value.label === 'string' &&
    isRecord(value.author) &&
    typeof value.author.name === 'string' &&
    typeof value.author.color === 'string' &&
    typeof value.contentHtml === 'string' &&
    typeof value.wordCount === 'number'
  );
}

function sortNewestFirst(versions: PageVersion[]): PageVersion[] {
  return [...versions].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Version storage behind a plain interface, same shape as the comment store:
 * plain JSON in localStorage keyed by page, capped at 50 versions per page
 * with the oldest evicted. Swappable for a server-backed store later.
 */
export interface VersionStore {
  list(pageId: string): PageVersion[];
  save(pageId: string, versions: PageVersion[]): void;
  /** Append one version, evict the oldest past the cap, persist, and return the list. */
  add(pageId: string, version: PageVersion): PageVersion[];
}

export const localVersionStore: VersionStore = {
  list(pageId: string): PageVersion[] {
    try {
      const raw = localStorage.getItem(keyFor(pageId));
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return sortNewestFirst(parsed.filter(isVersion));
    } catch {
      return [];
    }
  },
  save(pageId: string, versions: PageVersion[]): void {
    try {
      localStorage.setItem(keyFor(pageId), JSON.stringify(sortNewestFirst(versions)));
    } catch {
      /* storage unavailable — history stays session-only */
    }
  },
  add(pageId: string, version: PageVersion): PageVersion[] {
    const next = sortNewestFirst([version, ...localVersionStore.list(pageId)]);
    const capped = next.slice(0, MAX_VERSIONS_PER_PAGE);
    localVersionStore.save(pageId, capped);
    return capped;
  },
};

/** Builds the stored record for one captured state of the page. */
export function buildVersion(
  pageId: string,
  contentHtml: string,
  author: VersionAuthor,
  kind: PageVersion['kind'],
  label?: string,
): PageVersion {
  return {
    id: newVersionId(),
    pageId,
    createdAt: Date.now(),
    kind,
    label: label?.trim() || (kind === 'manual' ? 'Saved version' : 'Auto-save'),
    author,
    contentHtml,
    wordCount: wordCountOf(contentHtml),
  };
}
