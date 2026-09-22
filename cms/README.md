# DND CMS

React admin UI for managing DND PostgreSQL data through the Express API.

## Run

Checkout this branch first (CMS is not on `main` yet):

```bash
git fetch origin
git checkout cursor/dnd-cms-dda5
npm install
npm run cms:install
```

From repo root (API must be on `:3000`):

```bash
npm run db:seed
npm run dev          # API
npm run cms:dev      # CMS at http://localhost:5173
```

Or from this folder:

```bash
npm install
npm run dev
```

Vite proxies `/api` to `http://localhost:3000`.

**If `npm run cms:dev` says Missing script:** you are not on `cursor/dnd-cms-dda5`.

## Login

Seeded default:

- Email: `dm@example.com`
- Password: `password123`

## Features

- Dashboard counts
- CRUD for Rooms, Campaigns, Characters, Tags, Materials, Combinations
- User profile edit
- SQL table inspection
