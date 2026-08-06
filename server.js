const express = require('express');
const { WebSocketServer } = require('ws');
const http    = require('http');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

// sessions: Map<id, { state: object|null, clients: Set<ws> }>
const sessions = new Map();

app.use(express.static(path.join(__dirname, 'public')));

wss.on('connection', (ws) => {
  let sessionId = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'JOIN': {
        const id = msg.id;
        if (!id || typeof id !== 'string') return;
        sessionId = id;
        if (!sessions.has(id)) sessions.set(id, { state: null, clients: new Set() });
        const sess = sessions.get(id);
        sess.clients.add(ws);
        ws.send(JSON.stringify({ type: 'JOINED', id, state: sess.state }));
        console.log(`[${id}] Client joined (${sess.clients.size} connected)`);
        break;
      }

      case 'STATE': {
        if (!sessionId || !sessions.has(sessionId)) return;
        const sess = sessions.get(sessionId);
        sess.state = msg.state;
        const out = JSON.stringify({ type: 'STATE', state: msg.state });
        let count = 0;
        for (const client of sess.clients) {
          if (client !== ws && client.readyState === 1) {
            client.send(out);
            count++;
          }
        }
        if (count > 0) console.log(`[${sessionId}] State broadcast to ${count} client(s)`);
        break;
      }
    }
  });

  ws.on('close', () => {
    if (sessionId && sessions.has(sessionId)) {
      const sess = sessions.get(sessionId);
      sess.clients.delete(ws);
      console.log(`[${sessionId}] Client left (${sess.clients.size} remaining)`);
      // Expire empty sessions after 1 hour
      if (sess.clients.size === 0) {
        setTimeout(() => {
          const s = sessions.get(sessionId);
          if (s && s.clients.size === 0) {
            sessions.delete(sessionId);
            console.log(`[${sessionId}] Session expired`);
          }
        }, 60 * 60 * 1000);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Pool Scheduler listening on http://0.0.0.0:${PORT}`);
});
