# DND App Server

Express + PostgreSQL (Prisma) backend with JWT auth, Zod validation, OpenAPI docs, optional S3 uploads, and Socket.IO.

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
cp .env.example .env
docker compose up -d
npm install
npx prisma migrate deploy
npm run dev
```

- API: `http://localhost:3000/api`
- Docs: `http://localhost:3000/api/docs`
- Socket.IO: `http://localhost:3000/socket.io`

## CRUD endpoints

| Resource | Base path |
|----------|-----------|
| User | `/api/auth/users` (+ `/register`, `/login`, `/me`) |
| Room | `/api/rooms` |
| Campaign | `/api/campaigns` |
| Character | `/api/characters` |
| Tag | `/api/tags` |
| Material | `/api/materials` |
| Combination | `/api/combinations` |
| Upload | `/api/uploads/image` |

Each resource supports `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`.

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

## Optional S3

Set `S3_ENABLED=true` plus bucket/credentials to store uploads on S3; otherwise files go to local `uploads/`.
