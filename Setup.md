# DND App Setup

## Step 1. Clone Repository

```bash
git clone <repository-url>
cd <repository-folder>
```

## Step 2. Checkout Required Branch

```bash
git fetch origin
git checkout cursor/dnd-cms-dda5
```

## Step 3. Setup Environment

```bash
cp server/.env.example server/.env
```

確認 `server/.env` 的設定正確。

## Step 4. Install Dependencies

```bash
npm run server:install
npm run cms:install
npm run app:install
```

## Step 5. Setup PostgreSQL

需要先安裝並啟動 Docker。

```bash
npm run db:setup
```

## Step 6. Check Database

```bash
npm run db:tables
```

確認 Database 建立成功。

## Step 7. Start Backend

開啟 Terminal：

```bash
npm run dev
```

Backend：

```text
http://localhost:3000
```

## Step 8. Start CMS

開啟另一個 Terminal：

```bash
npm run cms:dev
```

CMS：

```text
http://localhost:5173
```

## Step 9. Start Desktop App

開啟另一個 Terminal：

```bash
npm run app:dev
```

會開啟 Electron Desktop App。

## Step 10. Login

使用 Seed 預設帳號：

```text
Email: dm@example.com
Password: password123
```

## Step 11. Test

確認以下功能可以正常使用：

```text
Backend  → localhost:3000
CMS      → localhost:5173
App      → Electron Desktop App
```