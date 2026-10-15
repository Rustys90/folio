import { WebsocketProvider } from 'y-websocket';
import type { Doc as YDoc } from 'yjs';

export interface SyncUser {
  name: string;
  color: string;
}

export interface SyncProviderOptions {
  /** Websocket URL, e.g. ws://localhost:4000/sync */
  url: string;
  /** Room name — one per Folio page. */
  room: string;
  /** Local user identity for presence. */
  user: SyncUser;
  /** Reconnect automatically on drop. Default true. */
  autoConnect?: boolean;
}

export interface FolioSyncProvider {
  provider: WebsocketProvider;
  disconnect: () => void;
  destroy: () => void;
  onStatus: (listener: (connected: boolean) => void) => () => void;
}

/**
 * Attach a Yjs document to the Folio sync server over websocket.
 *
 * Wraps y-websocket's provider with Folio's room convention (one room per page)
 * and presence setup. Safe to call with no server running — the provider queues
 * and retries, and local editing never blocks.
 */
export function createSyncProvider(
  doc: YDoc,
  { url, room, user, autoConnect = true }: SyncProviderOptions,
): FolioSyncProvider {
  const provider = new WebsocketProvider(url, room, doc, {
    connect: autoConnect,
  });

  provider.awareness.setLocalStateField('user', {
    name: user.name,
    color: user.color,
  });

  return {
    provider,
    disconnect: () => provider.disconnect(),
    destroy: () => provider.destroy(),
    onStatus: (listener) => {
      const handler = (event: { status: 'connected' | 'disconnected' | 'connecting' }) =>
        listener(event.status === 'connected');
      provider.on('status', handler);
      return () => provider.off('status', handler);
    },
  };
}
