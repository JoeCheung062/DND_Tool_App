# DND API Server

Express + PostgreSQL (Prisma) backend in `server/`. JWT auth, Zod validation, OpenAPI docs, optional S3 uploads, and Socket.IO.

Run these commands from the **repository root** (`npm run …` forwards here) or from this folder.

## How to check SQL tables

### 1. List tables + row counts (CLI)
```bash
npm run db:tables
```

### 2. Prisma Studio (browser GUI)
```bash
npm run db:studio
```
Opens `http://localhost:5555` — click any model (Room, Campaign, Material, …) to browse/edit rows.

### 3. Raw SQL (`psql`)
```bash
npm run db:psql
# then:
\dt                          -- list tables
\d "Material"                -- describe columns
SELECT * FROM "Room";
SELECT id, name, type FROM "Material";
```

### 4. Via API (JWT required)
```bash
# after login, use the token:
curl -H "Authorization: Bearer <JWT>" http://localhost:3000/api/admin/tables
curl -H "Authorization: Bearer <JWT>" http://localhost:3000/api/admin/tables/Material
curl -H "Authorization: Bearer <JWT>" http://localhost:3000/api/admin/overview
```

## Database (PostgreSQL)

All core tables support full **CRUD**:

| Table | Fields |
|-------|--------|
| **Room** | `id`, `name`, optional `campaignId` (script) |
| **Campaign** | `id`, `name` (used as Display App “script”) |
| **User** | `id`, profile (`displayName`, `avatarUrl`, `bio`) — **no login** |
| **Admin** | `id`, email, password, role (`SUPER_ADMIN` / `ADMIN` / `DM`) — **CMS login** |
| **Character** | `id`, `name`, `illustration`, `userId` |
| **Tag** | `id`, `name` |
| **Material** (Slide) | `id`, `type` (`IMAGE`/`EFFECT`/`SOUND`), `name`, `assetUrl`, campaign presets (M2M), tags (M2M) |
| **Combination** | `id`, `name`, `mainMaterialId`, connect materials (M2M) |

Join tables: `MaterialCampaignPreset`, `MaterialTag`, `CombinationConnect`.

## Quick start

```bash
# from the repository root
cp server/.env.example server/.env
npm run server:install

# Start PostgreSQL (Docker required), migrate, seed
npm run db:setup

# Terminal 1 — API (this folder)
npm run dev

# Terminal 2 — CMS
npm run cms:dev

# Terminal 3 — Display desktop app (Electron)
npm run display:install
npm run display:dev
```

- API: `http://localhost:3000/api`
- Docs: `http://localhost:3000/api/docs`
- CMS: `http://localhost:5173` — **Admin login only**
  - `dm@example.com` / `password123` (DM)
  - `admin@example.com` / `password123` (Admin)
  - `super@example.com` / `password123` (Super Admin)
- Display: **Electron desktop app** (Windows / macOS / Linux) — see `../display/README.md`

### Display App (Electron desktop)

Native multi-screen client — **not a website**. **Home → Create Room / Enter Room**. Create selects a **script** (Campaign), then enter detects screen IDs, registers them over Socket.IO, and applies `material:play` assignments with process verification (`display:ack` / `display:verify`).

```bash
npm run display:install
npm run display:dev        # launches Electron desktop app
npm run display:pack       # unpackaged build for current OS
npm run display:dist       # platform installers (AppImage/deb, exe, dmg)
npm run display:test       # routing/verification self-test
```

### Database not reachable (`localhost:5432`)

Prisma needs Postgres running. With Docker:

```bash
npm run db:up                 # docker compose up -d
npx prisma migrate deploy
npm run db:seed
```

Without Docker, install Postgres 16 locally and create database `dnd_app` with user/password matching `DATABASE_URL` in `.env`.

### `Unknown argument displayName` (schema mismatch)

Your code is new but the Prisma client/DB is still the old schema. Reset and regenerate:

```bash
git checkout cursor/dnd-cms-dda5
git pull origin cursor/dnd-cms-dda5
npm install
npm run db:fresh    # wipe Docker DB volume, generate, migrate, seed
# restart API: npm run dev
```

Login: `dm@example.com` / `password123`

Check connectivity:

```bash
npm run db:tables
```

## Data management API

| Resource | Base path | Methods |
|----------|-----------|---------|
| Admin overview / SQL tables | `/api/admin/overview`, `/api/admin/tables` | GET |
| User | `/api/auth/users` (+ `/register`, `/login`, `/me`) | CRUD |
| Room | `/api/rooms` | CRUD |
| Campaign | `/api/campaigns` | CRUD |
| Character | `/api/characters` | CRUD |
| Tag | `/api/tags` | CRUD |
| Material | `/api/materials` | CRUD |
| Combination | `/api/combinations` | CRUD |
| Upload | `/api/uploads/image` | POST |

CRUD = `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`.

### Material example (multipart file upload)

```bash
curl -X POST http://localhost:3000/api/materials \
  -H "Authorization: Bearer <JWT>" \
  -F "type=IMAGE" \
  -F "name=Tavern Background" \
  -F "campaignIds=[\"campaign_id\"]" \
  -F "tagIds=[\"tag_id\"]" \
  -F "file=@./tavern.png"
```

In the CMS Materials page, choose a file with the upload control (no URL needed).

### Character example (multipart illustration upload)

```bash
curl -X POST http://localhost:3000/api/characters \
  -H "Authorization: Bearer <JWT>" \
  -F "name=Thorin" \
  -F "userId=<user_id>" \
  -F "file=@./thorin.png"
```

Illustration is optional. In the CMS Characters page, pick an image file (JPEG/PNG/WebP/GIF).

### Combination example

```json
{
  "name": "Tavern Ambience Pack",
  "mainMaterialId": "material_image_id",
  "connectMaterialIds": ["material_sound_id", "material_effect_id"]
}
```

## Socket.IO

```js
import { io } from "socket.io-client";
const socket = io("http://localhost:3000", { auth: { token: "<JWT>" } });
socket.emit("room:join", { roomId }, console.log);
socket.emit("dice:roll", { roomId, expression: "2d6+3" }, console.log);
socket.emit("material:play", { roomId, materialId }, console.log);
```

## CMS and Display

Those apps live next to this folder (`../cms`, `../display`). Start them from the repository root with `npm run cms:dev` and `npm run display:dev`. This API must be listening on port 3000 first. The CMS proxies `/api` to it.

Sign in with `dm@example.com` / `password123`.
