# DND App Server

Express + PostgreSQL (Prisma) backend for managing DND data: JWT auth, Zod validation, OpenAPI docs, optional S3 uploads, and Socket.IO.

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
| **Room** | `id`, `name` |
| **Campaign** | `id`, `name` |
| **User** | `id`, profile (`displayName`, `avatarUrl`, `bio`) + auth |
| **Character** | `id`, `name`, `illustration`, `userId` |
| **Tag** | `id`, `name` |
| **Material** (Slide) | `id`, `type` (`IMAGE`/`EFFECT`/`SOUND`), `name`, `assetUrl`, campaign presets (M2M), tags (M2M) |
| **Combination** | `id`, `name`, `mainMaterialId`, connect materials (M2M) |

Join tables: `MaterialCampaignPreset`, `MaterialTag`, `CombinationConnect`.

## Quick start

```bash
git fetch origin && git checkout cursor/dnd-cms-dda5
cp .env.example .env
npm install && npm run cms:install

# Start PostgreSQL (Docker required), migrate, seed
npm run db:setup

# Terminal 1 — API
npm run dev

# Terminal 2 — CMS
npm run cms:dev
```

- API: `http://localhost:3000/api`
- Docs: `http://localhost:3000/api/docs`
- CMS: `http://localhost:5173` (`dm@example.com` / `password123`)

### Database not reachable (`localhost:5432`)

Prisma needs Postgres running. With Docker:

```bash
npm run db:up                 # docker compose up -d
npx prisma migrate deploy
npm run db:seed
```

Without Docker, install Postgres 16 locally and create database `dnd_app` with user/password matching `DATABASE_URL` in `.env`.

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

### Material example

```json
{
  "type": "IMAGE",
  "name": "Tavern Background",
  "assetUrl": "/uploads/tavern.png",
  "campaignIds": ["campaign_cuid_1", "campaign_cuid_2"],
  "tagIds": ["tag_cuid_1"]
}
```

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

## CMS (data management UI)

> The CMS lives on branch `cursor/dnd-cms-dda5` (not `main` yet).

```bash
git fetch origin
git checkout cursor/dnd-cms-dda5
npm install
npm install --prefix cms

npm run db:seed
npm run dev          # API on :3000  (separate terminal — required)
npm run cms:dev      # CMS on :5173
```

Open `http://localhost:5173` and sign in with `dm@example.com` / `password123`.

If you see `Missing script: "cms:dev"`, you are on the wrong branch — run `git checkout cursor/dnd-cms-dda5`.

If login fails with a JSON/API error, start the backend first (`npm run dev` on port 3000). The CMS proxies `/api` to that server.

The CMS provides dashboard counts, full CRUD for Rooms / Campaigns / Characters / Tags / Materials / Combinations, user profile editing, and SQL table inspection.
