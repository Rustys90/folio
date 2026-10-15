import * as Y from 'yjs';

export const FOLIO_DOC_ROOT = 'default';

/**
 * Create a Yjs document for one Folio page.
 *
 * Each page owns its document, so pages sync, persist, and conflict-resolve
 * independently. Works fully offline — no provider required.
 */
export function createFolioDoc(guid?: string): Y.Doc {
  return new Y.Doc({ guid });
}

/** True when the document has never held any content. */
export function isDocEmpty(doc: Y.Doc): boolean {
  return doc.getXmlFragment(FOLIO_DOC_ROOT).length === 0;
}

/** Serialize a document to bytes for storage or transport. */
export function encodeDocState(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

/** Hydrate a document from stored bytes. */
export function applyDocState(doc: Y.Doc, state: Uint8Array): void {
  Y.applyUpdate(doc, state);
}
