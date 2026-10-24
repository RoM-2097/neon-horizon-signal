// Neon Horizon — multiplayer signaling server (Phase 1).
// A tiny WebSocket lobby/signaling service for real-time 1v1 duels.
// The game itself is a static page; this service only INTRODUCES the two
// browsers (room create/join + relaying WebRTC offer/answer/ICE). The race
// runs peer-to-peer over a WebRTC data channel after the handshake.
//
// Deploy: Render web service (Node). package.json start script runs this file.
// No accounts, no public lobby browser: the room key IS the matchmaking.
// Two players per room, max. Host leaving closes the room.

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const rooms = new Map(); // code -> { host, guest, hostMeta, guestMeta }

function makeCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I lookalikes
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function peerOf(room, ws) {
  if (room.host === ws) return room.guest;
  if (room.guest === ws) return room.host;
  return null;
}

function closeRoom(code, reason) {
  const room = rooms.get(code);
  if (!room) return;
  rooms.delete(code);
  for (const ws of [room.host, room.guest]) {
    if (ws) send(ws, { type: 'room-closed', reason });
  }
}

const server = http.createServer((req, res) => {
  // Render health check + a wake endpoint the game pings on MULTIPLAYER tap.
  if (req.url === '/health' || req.url === '/wake') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.roomCode = null;
  ws.role = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'create') {
      let code = makeCode();
      while (rooms.has(code)) code = makeCode();
      rooms.set(code, { host: ws, guest: null, hostMeta: msg.meta || null, guestMeta: null });
      ws.roomCode = code;
      ws.role = 'host';
      send(ws, { type: 'created', code });
      return;
    }

    if (msg.type === 'join') {
      const code = String(msg.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) return send(ws, { type: 'error', error: 'no-room' });
      if (room.guest) return send(ws, { type: 'error', error: 'room-full' });
      room.guest = ws;
      room.guestMeta = msg.meta || null;
      ws.roomCode = code;
      ws.role = 'guest';
      // Tell both sides who they're racing; then they exchange WebRTC signaling.
      send(room.host, { type: 'peer-joined', meta: room.guestMeta });
      send(ws, { type: 'joined', code, meta: room.hostMeta });
      return;
    }

    if (msg.type === 'signal') {
      const room = rooms.get(ws.roomCode);
      if (!room) return;
      const peer = peerOf(room, ws);
      if (peer) send(peer, { type: 'signal', from: ws.role, data: msg.data });
      return;
    }

    if (msg.type === 'leave') {
      if (ws.roomCode) closeRoom(ws.roomCode, 'peer-left');
      return;
    }
  });

  ws.on('close', () => {
    if (ws.roomCode) {
      const room = rooms.get(ws.roomCode);
      if (room) {
        const peer = peerOf(room, ws);
        rooms.delete(ws.roomCode);
        if (peer) send(peer, { type: 'peer-left' });
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`[neon-horizon-signal] listening on ${PORT}`);
});
