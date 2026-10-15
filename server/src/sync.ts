import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { loadDoc, saveDoc } from './db.js';

/**
 * Folio sync server — a clean-room implementation of the Yjs websocket sync
 * protocol (the same wire protocol y-websocket clients speak).
 *
 * One "room" per Folio page. Each room holds a shared Y.Doc plus an awareness
 * instance for presence. Documents hydrate from PostgreSQL before the first
 * handshake and persist on a debounced schedule after updates.
 */

const messageSync = 0;
const messageAwareness = 1;

const PERSIST_DEBOUNCE_MS = 2000;

interface Room {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  /** Connections and the awareness client IDs each one controls. */
  conns: Map<WebSocket, Set<number>>;
}

const rooms = new Map<string, Room>();
const hydrated = new Set<string>();
const persistTimers = new Map<string, NodeJS.Timeout>();

function send(conn: WebSocket, message: Uint8Array): void {
  if (conn.readyState === WebSocket.OPEN) {
    conn.send(message);
  }
}

function schedulePersist(docName: string): void {
  const existing = persistTimers.get(docName);
  if (existing) clearTimeout(existing);
  persistTimers.set(
    docName,
    setTimeout(() => {
      persistTimers.delete(docName);
      const room = rooms.get(docName);
      if (!room) return;
      saveDoc(docName, Y.encodeStateAsUpdate(room.doc)).catch((err) => {
        console.error(`[sync] persist failed for ${docName}:`, err);
      });
    }, PERSIST_DEBOUNCE_MS),
  );
}

function getRoom(docName: string): Room {
  let room = rooms.get(docName);
  if (!room) {
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    const conns = new Map<WebSocket, Set<number>>();
    room = { doc, awareness, conns };

    // Broadcast document updates to every connection except the origin.
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);
      conns.forEach((_, conn) => {
        if (conn !== origin) send(conn, message);
      });
      schedulePersist(docName);
    });

    // Broadcast awareness (presence) updates, tracking which client IDs
    // belong to which connection so they can be cleaned up on disconnect.
    awareness.on(
      'update',
      (
        { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown,
      ) => {
        const changedClients = added.concat(updated, removed);
        if (origin !== null && typeof origin !== 'undefined') {
          const controlled = conns.get(origin as WebSocket);
          if (controlled) {
            added.forEach((id) => controlled.add(id));
            removed.forEach((id) => controlled.delete(id));
          }
        }
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageAwareness);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients),
        );
        const message = encoding.toUint8Array(encoder);
        conns.forEach((_, conn) => send(conn, message));
      },
    );

    rooms.set(docName, room);
  }
  return room;
}

/** Load persisted state into a fresh room exactly once. */
async function ensureHydrated(docName: string, doc: Y.Doc): Promise<void> {
  if (hydrated.has(docName)) return;
  hydrated.add(docName);
  try {
    const persisted = await loadDoc(docName);
    if (persisted && persisted.length > 0) {
      Y.applyUpdate(doc, persisted);
    }
  } catch (err) {
    console.error(`[sync] load failed for ${docName}:`, err);
  }
}

function handleMessage(conn: WebSocket, room: Room, data: Uint8Array): void {
  const decoder = decoding.createDecoder(data);
  const messageType = decoding.readVarUint(decoder);
  switch (messageType) {
    case messageSync: {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.readSyncMessage(decoder, encoder, room.doc, conn);
      if (encoding.length(encoder) > 1) {
        send(conn, encoding.toUint8Array(encoder));
      }
      break;
    }
    case messageAwareness: {
      awarenessProtocol.applyAwarenessUpdate(
        room.awareness,
        decoding.readVarUint8Array(decoder),
        conn,
      );
      break;
    }
    default:
      console.warn(`[sync] unknown message type: ${messageType}`);
  }
}

/**
 * Handle one websocket connection for a Folio page room.
 * URL convention: /sync/<room> — one room per page.
 */
export async function handleSyncConnection(
  ws: WebSocket,
  req: IncomingMessage,
): Promise<void> {
  const url = req.url ?? '/sync/';
  const docName = decodeURIComponent(
    url.replace(/^\/sync\//, '').split('?')[0] || '',
  );
  if (!docName) {
    ws.close(1008, 'missing room name');
    return;
  }

  const room = getRoom(docName);
  // Hydrate from storage before any client sees the document.
  await ensureHydrated(docName, room.doc);

  room.conns.set(ws, new Set());

  ws.on('message', (data) => {
    try {
      const buf = data instanceof Buffer ? new Uint8Array(data) : new Uint8Array(data as ArrayBuffer);
      handleMessage(ws, room, buf);
    } catch (err) {
      console.error('[sync] message handling failed:', err);
    }
  });

  ws.on('close', () => {
    const controlled = room.conns.get(ws);
    room.conns.delete(ws);
    if (controlled && controlled.size > 0) {
      awarenessProtocol.removeAwarenessStates(
        room.awareness,
        Array.from(controlled),
        null,
      );
    }
    // Reclaim memory when the room is empty.
    if (room.conns.size === 0) {
      schedulePersist(docName);
    }
  });

  ws.on('error', (err) => {
    console.error('[sync] socket error:', err);
  });

  // Opening handshake: sync step 1 + current awareness states.
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, room.doc);
  send(ws, encoding.toUint8Array(encoder));

  const states = room.awareness.getStates();
  if (states.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, messageAwareness);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(states.keys())),
    );
    send(ws, encoding.toUint8Array(awarenessEncoder));
  }
}
