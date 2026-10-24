# Neon Horizon — Signaling Service (Render deploy)

The game page is static; this tiny WebSocket service is the only hosted piece
of multiplayer. It introduces the two browsers (room create/join, relaying
WebRTC offer/answer/ICE) and then gets out of the way — the race itself runs
peer-to-peer over a WebRTC data channel.

## Deploy on Render (free tier works)

1. Put this folder in a Git repo (or use Render's "deploy from a folder" flow).
2. Render dashboard → New → Web Service → point it at the repo/folder.
3. Build command: `npm install`. Start command: `npm start`.
4. Render assigns a URL like `https://neon-horizon-signal.onrender.com`.
   Copy it into the game's MULTIPLAYER settings field (signaling URL).
5. Free-tier note: the service sleeps when idle. The game pings `/wake`
   when the MULTIPLAYER button is tapped, so the first lobby after a quiet
   spell takes ~30–60 s to come up — that's expected, not broken. An
   always-on (paid) instance removes the wait.

## Protocol (JSON over WebSocket)

- Client → `{ type: "create", meta: { name, car, livery } }`
  → Server: `{ type: "created", code }` (6-char room code)
- Client → `{ type: "join", code, meta: {...} }`
  → Server: `{ type: "joined", code, meta: <host meta> }` and the host gets
  `{ type: "peer-joined", meta: <guest meta> }`
- Either side → `{ type: "signal", data: <WebRTC payload> }` — relayed to the peer
- Either side → `{ type: "leave" }`, or socket close → the peer gets
  `{ type: "peer-left" }` and the room closes
- `GET /health` and `GET /wake` return `{ ok: true, rooms: n }`

## Limits by design

- 2 players per room, max. No accounts, no public lobby browser, no TURN
  relay (Phase 1). Symmetric-NAT players may fail peer-to-peer until a TURN
  fallback is added — that's a Phase 2/3 cost decision, not code debt.
