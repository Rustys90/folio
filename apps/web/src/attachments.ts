/**
 * Attachments — per-page file storage behind an interface.
 *
 * The web app owns attachment data through the `AttachmentStore` contract;
 * this file ships a localStorage implementation for offline-first use. An
 * S3-compatible backend can replace it later without touching any UI: it
 * would implement the same interface, persist blobs remotely, and return
 * signed (or object) URLs from `get`. Callers below only touch `Attachment`
 * records and the store contract, never storage internals.
 *
 * Storage model (local implementation): each page keeps its records under
 * `folio-attachments-<pageId>` as JSON — one record per file holding the
 * metadata plus the file bytes as a data URL. A small index
 * (`folio-attachment-index`) maps attachment id → pageId so `get`/`remove`
 * resolve without scanning every page.
 */

export interface Attachment {
  /** Opaque id; the key `get` resolves to a URL. */
  id: string;
  /** Page the file is attached to. */
  pageId: string;
  /** Original file name, e.g. "floor-plan.png". */
  name: string;
  /** Browser-detected MIME type, e.g. "image/png". May be empty when unknown. */
  mimeType: string;
  /** Byte size of the original file. */
  size: number;
  /** Unix epoch ms when the file was attached. */
  createdAt: number;
}

export interface AttachmentStore {
  /**
   * Persist `file` for `pageId`, resolving with the stored record.
   *
   * NOTE: the feature brief sketched `save(file)`; the interface takes
   * `pageId` first because attachments are scoped per page and `list` needs
   * the same scope to be useful. A server store would take `pageId` the same
   * way (e.g. as the bucket prefix or row column).
   *
   * Throws `AttachmentTooLargeError` past the hard cap, and
   * `AttachmentQuotaExceededError` when browser storage is full.
   */
  save(pageId: string, file: File): Promise<Attachment>;
  /**
   * Resolve an attachment id to a URL usable in `src`/`href` (a data URL in
   * the local implementation, a signed/object URL for a server store).
   * Returns null for unknown ids — safer than throwing when a record exists
   * but its bytes are gone (e.g. the user cleared site data).
   */
  get(id: string): string | null;
  /** Every attachment for a page, newest first. */
  list(pageId: string): Attachment[];
  /** Delete the record and its bytes. */
  remove(id: string): void;
}

/** Above this, the UI warns that the file is heavy for browser storage. */
export const ATTACHMENT_WARN_BYTES = 5 * 1024 * 1024;
/** Above this, the store refuses the file outright. */
export const ATTACHMENT_LIMIT_BYTES = 15 * 1024 * 1024;

export class AttachmentTooLargeError extends Error {
  constructor(
    readonly bytes: number,
    readonly limit: number,
  ) {
    super(
      `“${formatBytes(bytes)}” is over the ${formatBytes(limit)} attachment limit. ` +
        `Shrink the file and try again.`,
    );
    this.name = 'AttachmentTooLargeError';
  }
}

export class AttachmentQuotaExceededError extends Error {
  constructor() {
    super(
      'Browser storage is full — the file could not be saved. ' +
        'Remove an attachment or use a smaller file.',
    );
    this.name = 'AttachmentQuotaExceededError';
  }
}

export function newAttachmentId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `attachment-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'] as const;
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  const rounded = value >= 10 ? Math.round(value).toString() : value.toFixed(1);
  return `${rounded} ${units[index]}`;
}

export type AttachmentKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'file';

export function attachmentKind(mimeType: string): AttachmentKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('text/') || mimeType === 'application/json') return 'text';
  return 'file';
}

export function isImageAttachment(attachment: Attachment): boolean {
  return attachmentKind(attachment.mimeType) === 'image';
}

const PREFIX = 'folio-attachments-';
const INDEX_KEY = 'folio-attachment-index';

const keyFor = (pageId: string) => `${PREFIX}${pageId}`;

interface StoredRecord {
  attachment: Attachment;
  /** File bytes, base64 data URL. */
  dataUrl: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAttachment(value: unknown): value is Attachment {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.pageId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.mimeType === 'string' &&
    typeof value.size === 'number' &&
    typeof value.createdAt === 'number'
  );
}

function isStoredRecord(value: unknown): value is StoredRecord {
  return (
    isRecord(value) &&
    isAttachment(value.attachment) &&
    typeof value.dataUrl === 'string'
  );
}

function readRecords(pageId: string): StoredRecord[] {
  try {
    const raw = localStorage.getItem(keyFor(pageId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredRecord);
  } catch {
    return [];
  }
}

function readIndex(): Record<string, string> {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    const index: Record<string, string> = {};
    for (const [id, pageId] of Object.entries(parsed)) {
      if (typeof pageId === 'string') index[id] = pageId;
    }
    return index;
  } catch {
    return {};
  }
}

function writeIndex(index: Record<string, string>): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    /* index is best-effort; get/remove fall back to scanning page keys */
  }
}

/** Fallback when the index is missing: find which page key holds the id. */
function findPageId(id: string): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      const pageId = key.slice(PREFIX.length);
      if (readRecords(pageId).some((record) => record.attachment.id === id)) return pageId;
    }
  } catch {
    /* storage unavailable */
  }
  return null;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read “${file.name}”.`));
    reader.readAsDataURL(file);
  });
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

export const localAttachmentStore: AttachmentStore = {
  async save(pageId: string, file: File): Promise<Attachment> {
    if (file.size > ATTACHMENT_LIMIT_BYTES) {
      throw new AttachmentTooLargeError(file.size, ATTACHMENT_LIMIT_BYTES);
    }
    const dataUrl = await readAsDataUrl(file);
    const attachment: Attachment = {
      id: newAttachmentId(),
      pageId,
      name: file.name || 'Untitled file',
      mimeType: file.type,
      size: file.size,
      createdAt: Date.now(),
    };
    const records = readRecords(pageId);
    records.unshift({ attachment, dataUrl });
    try {
      localStorage.setItem(keyFor(pageId), JSON.stringify(records));
    } catch (error) {
      if (isQuotaError(error)) throw new AttachmentQuotaExceededError();
      throw error;
    }
    const index = readIndex();
    index[attachment.id] = pageId;
    writeIndex(index);
    return attachment;
  },

  get(id: string): string | null {
    const pageId = readIndex()[id] ?? findPageId(id);
    if (!pageId) return null;
    const record = readRecords(pageId).find((candidate) => candidate.attachment.id === id);
    return record?.dataUrl ?? null;
  },

  list(pageId: string): Attachment[] {
    return readRecords(pageId)
      .map((record) => record.attachment)
      .sort((a, b) => b.createdAt - a.createdAt);
  },

  remove(id: string): void {
    const pageId = readIndex()[id] ?? findPageId(id);
    if (pageId) {
      const records = readRecords(pageId).filter(
        (record) => record.attachment.id !== id,
      );
      try {
        localStorage.setItem(keyFor(pageId), JSON.stringify(records));
      } catch {
        /* storage unavailable — the in-memory view already dropped it */
      }
    }
    const index = readIndex();
    if (index[id] !== undefined) {
      delete index[id];
      writeIndex(index);
    }
  },
};
