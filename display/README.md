# DND Display (Electron desktop app)

Cross-platform **native desktop application** for multi-screen DND sessions — **not a website**.

Built with **Electron** for Windows, macOS, and Linux.

## Flow

1. **Home** → Create Room / Enter Room  
2. **Create Room** → set room name → select Campaign → Enter Room  
3. **Enter Room** → detect connected screens + IDs → download every Material for that Campaign, including materials marked General, onto the device  
4. **Socket.IO** receives `material:play` with per-screen assignments (one screen can receive several materials)  
5. **Process authentication** — each display window acks with a process token issued at window creation. The server checks the token and emits `display:authenticated` before the screen paints  
6. **Canvas** — authenticated screens draw IMAGE and EFFECT layers together; SOUND plays alongside the canvas  

## Run the desktop app

API must be running (`npm run dev` from the repo root, which starts `server/`) with Postgres.

```bash
# from repo root
npm run display:install
npm run display:dev          # launches Electron + Vite (native window)
```

Or from `display/`:

```bash
npm install
npm run dev                  # Electron desktop shell
npm start                    # run built app (after npm run build)
```

Sign in with a DM/Admin account (e.g. `dm@example.com` / `password123`).

> Opening the Vite URL in a browser is blocked on purpose — screen detection and fullscreen display windows require the Electron shell.

## Package installers (Win / macOS / Linux)

```bash
cd display
npm run dist                 # current platform
npm run dist:linux           # AppImage + deb
npm run dist:win             # NSIS + portable
npm run dist:mac             # dmg + zip (macOS host)
npm run pack                 # unpackaged dir (useful for smoke tests)
```

Artifacts land in `display/release/`:

| Platform | Output |
|----------|--------|
| Linux | `DND Display-*.AppImage`, `*.deb` |
| Windows | `DND Display Setup *.exe`, portable exe |
| macOS | `DND Display-*.dmg` |

## Socket protocol (Display)

| Event | Direction | Purpose |
|-------|-----------|---------|
| `room:join` | Display → Server | Enter room |
| `display:register` | Display → Server | Publish screen IDs + process map |
| `display:heartbeat` | Display → Server | Periodic process liveness |
| `display:verify` | Server → Display | Challenge process verification |
| `display:verify-result` | Display → Server | Verification response |
| `material:play` | Server → Display | Assign one or more materials to screenId(s) |
| `display:ack` | Display → Server | Per-screen apply + process token |
| `display:authenticated` | Server → Display | Token matched; screen may paint |

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Electron desktop app (dev) |
| `npm run build` | Build renderer + Electron main |
| `npm run start` | Launch built desktop app |
| `npm run dist` | Package platform installers |
| `npm run test:logic` | Screen routing / verification helpers |
