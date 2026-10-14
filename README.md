# FLUX — Digital Products Reseller

FLUX is a Telegram Mini App starter for browsing digital products, requesting wallet top-ups, and placing orders.

## Current build
- **React 19 + TypeScript + Vite + Tailwind CSS 4**, with a Coinbase-inspired design system: large balance read-outs, round quick actions, asset-style product rows, pill buttons, bottom sheets and skeleton loading states.
- **Telegram-native behaviour:** follows Telegram's light/dark theme (with a manual override), syncs the header/background/bottom bar colors, uses the native BackButton, haptic feedback and native confirm dialogs, and respects safe areas.
- Customer app: Home (marketplace), Wallet, Orders and Profile. The product sheet detects an insufficient balance and offers "Add funds" instead of failing at checkout.
- Operations console at `/admin` (code-split, so customers never download it). Every admin API call is still enforced server-side by `ADMIN_TELEGRAM_IDS`.
- Telegram bot commands: `/start`, `/help`, `/balance`, and `/orders`. Admin-only: `/pending`, `/stats`, `/approve TOPUP_ID`, and `/reject TOPUP_ID`. Verify funds in the receiving account before using `/approve`.
- GitHub Actions typechecks and builds the frontend and checks Python syntax on every push and pull request.

## Project structure
```
src/
  main.tsx            entry (lazy-loads the admin console on /admin)
  App.tsx             customer app shell, tabs and sheets
  index.css           design tokens (light/dark) and component styles
  lib/                api client, Telegram SDK wrapper, formatting, types
  hooks/              useTheme, useResource, useBackButton
  components/         UI kit (Button, Sheet, Toast...), chrome, shared blocks
  pages/              Home, Wallet, Orders, Profile
  sheets/             TopUp, Payment, Product and info sheets
  admin/Admin.tsx     operations console
main.py               FastAPI backend (API, Telegram webhook, serves frontend_dist)
```

## Status: starter scaffold
This is not production-ready for real payments or automated fulfillment. The supplier integration, customer delivery flow, and complete order-review/refund tooling are not implemented yet. Sample products and prices are placeholders. Top-ups require an administrator to confirm that funds actually arrived. Supplier API integration is not included yet.

## Run locally
```bash
# backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
FLUX_DEMO_MODE=true uvicorn main:app --reload      # API on :8000

# frontend (second terminal), hot reload with /api proxied to :8000
npm install
npm run dev                                         # http://localhost:5173
```
For a production-style run, `npm run build` and open `http://localhost:8000` (FastAPI serves `frontend_dist/`). The admin console lives at `/admin`.

Set `TELEGRAM_BOT_TOKEN` and `ADMIN_TELEGRAM_IDS` before using Telegram authentication. `FLUX_DEMO_MODE=true` is for local previews only and must never be enabled in production.

## Supabase database
1. Create a Supabase project.
2. Open **Project Settings → Database** and copy a PostgreSQL connection string. For hosted environments, use the Session Pooler if direct connectivity is unavailable.
3. Add it to Render as the secret environment variable `SUPABASE_DB_URL`. Do not commit credentials to GitHub.
4. On startup, the app creates the required starter tables automatically.

## Render
Create a new Web Service from this repository. Build command: `pip install -r requirements.txt`. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`.

## Before accepting real funds
- Set `SUPABASE_DB_URL` to your Supabase PostgreSQL connection string. The app prefers Supabase PostgreSQL when this variable is present and falls back to local SQLite only for local development.
- Configure and verify recipient details for each supported payment method.
- Implement supplier catalog sync and secure fulfillment.
- Add admin review tooling, audit logs, rate limiting, monitoring, and backups.
- Verify every payment from the receiving account before crediting any wallet.
- Never treat a submitted transfer reference or unique decimal amount as proof of payment.
