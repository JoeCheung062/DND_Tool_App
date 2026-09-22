# DND Display App (Electron)

Cross-platform **Display App** for multi-screen DND sessions.

## Flow

1. **Home** → Create Room / Enter Room  
2. **Create Room** → set room name → select script (Campaign) → Enter Room  
3. **Enter Room** → detect connected screens + IDs → open a fullscreen window per screen  
4. **Socket.IO** receives `material:play` with per-screen assignments  
5. **Process verification** — each display window must ack; heartbeats + `display:verify` confirm processes are alive  

## Run

API must be running (`npm run dev` from repo root) with Postgres.

```bash
# from repo root
npm run display:install
npm run display:dev          # Vite UI on :5174 (browser mock screens OK)
npm run display:electron     # Electron shell (needs display:dev or a build)
```

Typical local pair:

```bash
# terminal A
npm run display:dev

# terminal B
npm run display:electron
```

Sign in with a DM/Admin account (e.g. `dm@example.com` / `password123`).

## Socket protocol (Display)

| Event | Direction | Purpose |
|-------|-----------|---------|
| `room:join` | Display → Server | Enter room |
| `display:register` | Display → Server | Publish screen IDs + process map |
| `display:heartbeat` | Display → Server | Periodic process liveness |
| `display:verify` | Server → Display | Challenge process verification |
| `display:verify-result` | Display → Server | Verification response |
| `material:play` | Server → Display | Assign content to screenId(s) |
| `display:ack` | Display → Server | Per-screen apply + process verification |

Example play payload:

```json
{
  "roomId": "…",
  "requestId": "req_123",
  "assignments": [
    { "screenId": 1, "materialId": "…" },
    { "screenId": 2, "materialId": "…" }
  ]
}
```

## Scripts

- `npm run typecheck` — renderer TS  
- `npm run test:logic` — screen routing / verification helpers  
- `npm run build` — Vite + Electron main/preload  
