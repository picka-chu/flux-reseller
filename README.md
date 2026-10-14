# FLUX — Digital Products Reseller

FLUX is a Telegram Mini App starter for browsing digital products, requesting wallet top-ups, and placing orders.

## Current build\n- Dedicated Home, Wallet, Orders, and Profile pages with adaptive light/dark themes, professional typography, and Lucide icons.\n- Telegram bot commands: `/start`, `/help`, `/balance`, and `/orders`.\n- Admin-only bot commands: `/pending`, `/stats`, `/approve TOPUP_ID`, and `/reject TOPUP_ID`. Verify funds in the receiving account before using `/approve`.\n- GitHub Actions checks Python and JavaScript syntax on pushes and pull requests.\n\n## Status: starter scaffold
This is not production-ready for real payments or automated fulfillment. The supplier integration, customer delivery flow, and complete order-review/refund tooling are not implemented yet. Sample products and prices are placeholders. Top-ups require an administrator to confirm that funds actually arrived. Supplier API integration is not included yet.

## Run locally
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload
```

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
