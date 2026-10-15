/**
 * Public page sharing — the local-first share store.
 *
 * Folio has no server (yet), so share records live in localStorage and public
 * links resolve on this device. The URL scheme is `#/p/<publicId>` — designed
 * so a future sync server can serve the same path from HTTP. The public id is
 * an unguessable random token, never the page id, so links can't be enumerated.
 */

/** A published (or previously published) page. */
export interface SharedPage {
  /** The workspace page this share belongs to. */
  pageId: string;
  /** Unguessable token identifying the public link. */
  publicId: string;
  /** When false the link stops resolving, but the token is kept for re-publishing. */
  enabled: boolean;
  createdAt: number;
}

const SHARES_KEY = 'folio-shares';

function isSharedPage(value: unknown): value is SharedPage {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.pageId === 'string' &&
    typeof record.publicId === 'string' &&
    typeof record.enabled === 'boolean' &&
    typeof record.createdAt === 'number'
  );
}

function readShares(): SharedPage[] {
  try {
    const raw = localStorage.getItem(SHARES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSharedPage) : [];
  } catch {
    return [];
  }
}

function writeShares(shares: SharedPage[]): void {
  try {
    localStorage.setItem(SHARES_KEY, JSON.stringify(shares));
  } catch {
    /* storage unavailable — sharing stays session-local */
  }
}

/** Unguessable 128-bit token, hex-encoded. Falls back without crypto.randomUUID. */
function newPublicId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  let id = '';
  for (let i = 0; i < 32; i++) id += Math.floor(Math.random() * 16).toString(16);
  return id;
}

/**
 * Publish a page. Re-enabling a previously disabled share reuses its public
 * id, so an old link starts working again instead of minting a new one.
 */
export function enableSharing(pageId: string): SharedPage {
  const shares = readShares();
  const existing = shares.find((share) => share.pageId === pageId);
  if (existing) {
    const updated: SharedPage = { ...existing, enabled: true };
    writeShares(shares.map((share) => (share.pageId === pageId ? updated : share)));
    return updated;
  }
  const created: SharedPage = {
    pageId,
    publicId: newPublicId(),
    enabled: true,
    createdAt: Date.now(),
  };
  writeShares([...shares, created]);
  return created;
}

/** Unpublish a page. The token is kept so re-publishing restores the same link. */
export function disableSharing(pageId: string): void {
  const shares = readShares();
  writeShares(
    shares.map((share) => (share.pageId === pageId ? { ...share, enabled: false } : share)),
  );
}

/** The share record for a workspace page, or null if never published. */
export function getShare(pageId: string): SharedPage | null {
  return readShares().find((share) => share.pageId === pageId) ?? null;
}

/**
 * The share record for a public id — returned even when disabled, so the
 * public route can tell "link never existed" apart from "publishing turned off".
 */
export function getPageByPublicId(publicId: string): SharedPage | null {
  return readShares().find((share) => share.publicId === publicId) ?? null;
}

/** The shareable URL for a public id. Same shape a future server will serve. */
export function publicPageUrl(publicId: string): string {
  return `${window.location.origin}${window.location.pathname}#/p/${publicId}`;
}
