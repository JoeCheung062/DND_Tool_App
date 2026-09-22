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

From repo root — **two terminals**:

```bash
# Terminal 1 — API (required)
npm run dev

# Terminal 2 — CMS
npm run cms:dev
```

Open `http://localhost:5173`. The CMS proxies `/api` → `http://localhost:3000`.

If login shows an API/JSON error, the backend is not running on `:3000`.

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
