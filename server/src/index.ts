import 'dotenv/config';
import http from 'http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { initDb, listDocs } from './db.js';
import { handleSyncConnection } from './sync.js';

const PORT = Number(process.env.PORT ?? 4000);

async function main(): Promise<void> {
  await initDb();

  const app = express();
  app.use(express.json());

  app.get('/health', async (_req, res) => {
    res.json({ ok: true, docs: await listDocs() });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // Only /sync/* upgrades become Yjs rooms; everything else gets 404.
  server.on('upgrade', (req, socket, head) => {
    if (req.url?.startsWith('/sync/')) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        handleSyncConnection(ws, req).catch((err) => {
          console.error('[sync] connection failed:', err);
          ws.close(1011, 'internal error');
        });
      });
    } else {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
    }
  });

  server.listen(PORT, () => {
    console.log(`[folio] sync server listening on :${PORT} (ws path /sync/<room>)`);
  });
}

main().catch((err) => {
  console.error('[folio] fatal:', err);
  process.exit(1);
});
