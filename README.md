# DND App Server

Express + PostgreSQL (Prisma) backend with JWT auth, Zod validation, OpenAPI docs, optional S3 image uploads, and Socket.IO realtime.

## Stack

- **Express 5** + TypeScript
- **PostgreSQL** via **Prisma**
- **Auth** — register / login / `Bearer` JWT
- **Uploads** — local disk by default; **optional S3** when `S3_ENABLED=true`
- **Zod** request validation + **Swagger UI** at `/api/docs`
- **Socket.IO** — campaign rooms, chat, dice rolls, session updates

## Quick start

```bash
cp .env.example .env
docker compose up -d          # PostgreSQL on :5432
npm install
npx prisma migrate dev --name init
npm run dev
```

- API: `http://localhost:3000/api`
- Docs: `http://localhost:3000/api/docs`
- Socket.IO: `http://localhost:3000/socket.io`

## REST overview

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | — | Health check |
| POST | `/api/auth/register` | — | Create account |
| POST | `/api/auth/login` | — | Issue JWT |
| GET | `/api/auth/me` | JWT | Current user |
| GET/POST | `/api/campaigns` | JWT | List / create campaigns |
| GET/PATCH | `/api/campaigns/:id` | JWT | Get / update campaign |
| POST | `/api/campaigns/characters` | JWT | Create character |
| GET | `/api/campaigns/characters/mine` | JWT | List my characters |
| GET | `/api/uploads/storage` | — | `local` or `s3` mode |
| POST | `/api/uploads/image` | JWT | Multipart field `image` |

## Socket.IO

Connect with the JWT from login:

```js
import { io } from "socket.io-client";

const socket = io("http://localhost:3000", {
  auth: { token: "<JWT>" },
});

socket.emit("campaign:join", { campaignId }, console.log);
socket.emit("chat:message", { campaignId, content: "Hello table!" }, console.log);
socket.emit("dice:roll", { campaignId, expression: "2d6+3", reason: "Attack" }, console.log);
socket.on("dice:result", console.log);
socket.on("chat:message", console.log);
socket.on("campaign:presence", console.log);
socket.on("session:update", console.log);
```

| Client → server | Server → clients |
|-----------------|------------------|
| `campaign:join` / `campaign:leave` | `campaign:presence` |
| `chat:message` | `chat:message` |
| `dice:roll` | `dice:result` |
| `session:update` | `session:update` |
| — | `connected` |

## Optional S3

Leave `S3_ENABLED=false` for local `uploads/`. To use S3 (or S3-compatible storage):

```env
S3_ENABLED=true
S3_BUCKET=your-bucket
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
# S3_ENDPOINT=...   # MinIO / R2 etc.
# S3_PUBLIC_URL=... # optional public/CDN base
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server with reload |
| `npm run build` / `npm start` | Production build & run |
| `npm run prisma:migrate` | Create / apply migrations |
| `npm run prisma:studio` | Prisma Studio |
| `npm run typecheck` | TypeScript check |
