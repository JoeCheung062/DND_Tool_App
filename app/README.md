# DND App (Electron desktop app)

Cross-platform **native desktop application** for multi-screen DND sessions — **not a website**.

Built with **Electron** for Windows, macOS, and Linux. After sign-in, choose **Display Mode** or **Control Mode**.

## Flow

1. **Sign in** → choose Display Mode or Control Mode → Create Room or Enter Room → **select a campaign** (required in both modes)
2. **Display Mode** → Create Room / Enter Room → set room name → select Campaign → detect screens and IDs → download campaign materials plus General materials → wait for Socket.IO play instructions → authenticate the screen process → paint layers on a canvas
3. **Control Mode** → Create Room / Enter Room → connect to every Display Mode device over Socket.IO → read screen IDs → download that campaign’s materials, including General → arrange them in zones 1–4 (drag layers, set order, preview on a canvas) → map each zone to a screen and a speaker → send the material IDs. Display Mode authenticates the screen process and paints from its own downloaded files

Open the app twice on one computer to run both modes at the same time.

## Run the desktop app

API must be running (`npm run dev` from the repo root, which starts `server/`) with Postgres.

```bash
# from repo root
npm run app:install
npm run app:dev          # launches Electron + Vite (native window)
```

Or from `app/`:

```bash
npm install
npm run dev                  # Electron desktop shell
npm start                    # run built app (after npm run build)
```

Sign in with a DM/Admin account (e.g. `dm@example.com` / `password123`).

> Opening the Vite URL in a browser is blocked on purpose — screen detection and fullscreen display windows require the Electron shell.

## Package installers (Win / macOS / Linux)

```bash
cd app
npm run dist                 # current platform
npm run dist:linux           # AppImage + deb
npm run dist:win             # NSIS + portable
npm run dist:mac             # dmg + zip (macOS host)
npm run pack                 # unpackaged dir (useful for smoke tests)
```

Artifacts land in `app/release/`:

| Platform | Output |
|----------|--------|
| Linux | `DND App-*.AppImage`, `*.deb` |
| Windows | `DND App Setup *.exe`, portable exe |
| macOS | `DND App-*.dmg` |

## Socket protocol

| Event | Direction | Purpose |
|-------|-----------|---------|
| `room:join` | App → Server | Enter room |
| `display:register` | Display → Server | Publish screen IDs + process map |
| `display:registry` | Server → Control | Connected screens |
| `display:heartbeat` | Display → Server | Periodic process liveness |
| `display:verify` | Control → Server → Display | Challenge process verification |
| `display:verify-result` | Display → Server | Verification response |
| `material:play` | Control → Server → Display | Assign one or more materials to screenId(s) |
| `display:ack` | Display → Server | Per-screen apply + process token |
| `display:authenticated` | Server → App | Token matched; screen may paint |

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Electron desktop app (dev) |
| `npm run build` | Build renderer + Electron main |
| `npm run start` | Launch built desktop app |
| `npm run dist` | Package platform installers |
| `npm run test:logic` | Screen routing / verification helpers |
