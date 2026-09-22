# DND App

Three apps in one repository:

| Folder | What it is |
|--------|------------|
| [`server/`](server/) | Express + PostgreSQL API, Prisma, JWT, Socket.IO |
| [`cms/`](cms/) | React CMS for managing data |
| [`display/`](display/) | Electron desktop app for multi-screen display |

## Quick start

```bash
cp server/.env.example server/.env
npm run server:install
npm run cms:install
npm run display:install

npm run db:setup     # Postgres, migrate, seed
npm run dev          # API on http://localhost:3000
npm run cms:dev      # CMS on http://localhost:5173
npm run display:dev  # Electron Display app
```

Admin login: `dm@example.com` / `password123`

Details: [server/README.md](server/README.md), [display/README.md](display/README.md).
