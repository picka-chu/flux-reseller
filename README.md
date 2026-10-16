# FLUX

FLUX is a Telegram Mini App and bot for buying digital subscriptions with a prepaid wallet.
Customers browse plans, add funds, and buy. Orders are placed with a supplier through its reseller
API, and delivered details appear under **Orders**. Admins run the store from a separate console
at `/admin`.

> **Status:** in active development. Read [Going live](#going-live) before taking real money.

- [Features](#features)
- [How it works](#how-it-works)
- [Project layout](#project-layout)
- [Run it locally](#run-it-locally)
- [Configuration](#configuration)
- [Set up Telegram](#set-up-telegram)
- [Set up the supplier](#set-up-the-supplier)
- [Deploy on Render](#deploy-on-render)
- [Testing](#testing)
- [Operations](#operations)
- [Going live](#going-live)

## Features

**Customers**
- Feed on the home screen: best offers, just restocked, trending plans, and sponsored placements.
- Shop with search and category filters and sold-out markers.
- Product pages with price, billing period, stock, how the order is handled, and a sticky buy bar.
- Wallet with deposits by USDT transfer (Bybit UID or Telegram Wallet), reviewed by hand.
- Orders with live status and delivered details.
- Support chat through the bot.
- Light, dark, or Telegram theme.

**Admins** (`/admin`, restricted to `ADMIN_TELEGRAM_IDS`)
- Overview and 14-day revenue and order charts; a *needs attention* queue.
- Top-up review (approve or reject against the exact amount and reference).
- Order management: processing, delivered, rejected, refunded — with an optional note (used for
  delivery details or the refund reason). Refunds are single-use.
- Catalogue: margins, visibility, and supplier sync.
- Sponsored ads for the home feed and shop.
- Customers, settings (payment addresses and pricing defaults), and an Ops health page.
- Alerts to Telegram when something needs a human; ops health page in the console.

## How it works

```
Customer (Telegram Mini App)
   │  wallet debit, order request
   ▼
FastAPI backend ──► Supplier reseller API   (product, price, stock, order placement)
   │  │
   │  └─ unclear result? → hold as "needs review", reconcile against the supplier's order list
   ▼
PostgreSQL (Supabase) or SQLite (local)     wallet ledger, orders, top-ups, support, ads
   ▲
Admin console (/admin)   ·   Telegram bot (customer messages, admin alerts)
```

**Money rules.** The wallet is debited before the supplier is called. A clear refusal from the supplier
refunds automatically. An unclear answer is never refunded or delivered by guesswork: the app checks
the supplier's own order list. Refunds are idempotent, so the same order cannot be refunded twice.

## Project layout

```
main.py                    FastAPI backend: API, supplier client, order logic, bot, ops, admin
src/
  main.tsx                 entry point (lazy-loads the admin console on /admin)
  App.tsx                  customer shell: tabs, product page, sheets, back button
  admin/                   operations console (overview, top-ups, orders, catalogue, ads, settings)
  pages/                   Home, Shop, ProductPage, Wallet, Orders, Profile
  sheets/                  top-up, payment, support, and info sheets
  components/              UI kit, navigation, shared blocks
  lib/                     API client, Telegram wrapper, formatting, brand, types
tests/                     backend tests (pytest), run in CI
scripts/                   backup.sh, restore_drill.sh
docs/
  OPERATIONS.md            alerts, health checks, backups
  RUNBOOK.md               what to do when something needs attention
.github/workflows/ci.yml   typecheck, build, backend tests on every pull request
render.yaml                Render deployment blueprint
```

## Run it locally

You need Python 3.12, Node 20, and (optionally) PostgreSQL. SQLite works for local testing.

```bash
# Backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env          # then edit it; see Configuration
FLUX_DEMO_MODE=true ADMIN_TELEGRAM_IDS=100000001 uvicorn main:app --reload --port 8000

# Frontend, in a second terminal (hot reload; /api is proxied to port 8000)
npm install
npm run dev                   # http://localhost:5173
```

`FLUX_DEMO_MODE=true` signs every request in as a demo user. **Never set it in production.**

For a production-style run, build the frontend and let FastAPI serve it:

```bash
npm run build
uvicorn main:app --port 8000   # open http://localhost:8000
```

Admin console: `http://localhost:8000/admin`.

## Configuration

Set these as environment variables (Render: *Environment*; locally: `.env`).

| Variable | Required | Purpose |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes (production) | Bot token from @BotFather. Enables sign-in checks, support, and alerts. |
| `TELEGRAM_WEBHOOK_SECRET` | Yes (production) | Random string that secures the bot webhook. |
| `ADMIN_TELEGRAM_IDS` | Yes | Comma-separated Telegram user IDs allowed into `/admin` and to receive alerts. |
| `FLUX_WEBAPP_URL` or `RENDER_EXTERNAL_URL` | Yes (production) | Public HTTPS URL of the app. The bot registers its webhook there. |
| `SUPABASE_DB_URL` or `DATABASE_URL` | Yes (production) | PostgreSQL connection string. If unset, SQLite is used. |
| `DATABASE_PATH` | No | SQLite file location (default `./flux.db`), for local use only. |
| `DB_POOL_MAX_SIZE` | No | Postgres connection pool size (default 8). |
| `SUPPLIER_API_KEY` | Yes (to sell) | Reseller API key. Without it, the catalogue is empty and ordering is off. |
| `SUPPLIER_API_BASE` | No | Reseller API base URL (defaults to the supplier in use). |
| `SUPPLIER_LOW_BALANCE` | No | Alert when the supplier balance drops below this amount. `0` disables it. |
| `CATALOG_SYNC_MINUTES` | No | How often the catalogue is pulled from the supplier (default 30). |
| `PAYMENT_TTL_MINUTES` | No | How long a deposit request stays valid (default 20). |
| `OPS_STUCK_MINUTES` | No | Minutes before an order waiting on the supplier is reported (default 30). |
| `OPS_TOPUP_STALE_HOURS` | No | Hours before a pending top-up is reported (default 12). |
| `OPS_ALERT_COOLDOWN_MINUTES` | No | Minimum minutes between repeats of the same alert (default 60). |
| `FLUX_DEMO_MODE` | No | `true` only for local development. Must be `false` in production. |
| `BRAND_NAME` | No | Name shown in metadata and the bot. Set to `FLUX`. |

Brand text in the app comes from `src/lib/brand.ts`.

## Set up Telegram

1. In @BotFather, create a bot and copy its token into `TELEGRAM_BOT_TOKEN`.
2. Make a random secret for `TELEGRAM_WEBHOOK_SECRET`, for example `python -c "import secrets;print(secrets.token_urlsafe(32))"`.
3. In @BotFather, open the bot → *Bot Settings → Menu Button* (or *Configure Mini App*) and set the
   URL to your public `https://` address.
4. Deploy. On start, the app registers the webhook at `<public URL>/telegram/webhook` (authenticated
   by the `X-Telegram-Bot-Api-Secret-Token` header set from `TELEGRAM_WEBHOOK_SECRET`).
5. Every admin must start a chat with the bot, or they will not receive alerts.

Bot commands for customers: `/start`, `/help`, `/balance`, `/orders`.
Bot commands for admins: `/pending`, `/stats`, `/approve TOPUP_ID`, `/reject TOPUP_ID`, `/close`, `/cancel`.

## Set up the supplier

1. Create a reseller API key in your supplier account and set `SUPPLIER_API_KEY`.
2. Confirm the supplier's products list and account info endpoints respond with that key.
3. Keep enough balance with the supplier to cover orders. Set `SUPPLIER_LOW_BALANCE` so you are warned early.
4. Open **Admin → Catalogue** after the first sync. Check each product's margin and visibility.

If the key is missing, the app runs, but the catalogue stays empty and purchases are disabled.

## Deploy on Render

`render.yaml` describes the service.

- **Build command:** `npm ci && npm run build && pip install -r requirements.txt`
- **Start command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
- **Plan:** the blueprint uses the free plan. Free services sleep when idle, which stops the background
  sync and alert loops. Use a paid plan for production (see [OPERATIONS.md](docs/OPERATIONS.md#free-hosting-warning)).

Set the secret variables in Render (they are marked `sync: false`). Then deploy, and check:

1. `https://<your-app>/health` returns OK.
2. The logs show `Uvicorn running`, and no `Catalogue sync failed` lines.
3. Open the bot in Telegram and send `/start`.
4. Open the Mini App from the bot and confirm the catalogue loads.
5. Open the admin console as an admin and confirm the **Ops** page shows `alerts_enabled: true`.

## Testing

```bash
pip install -r requirements.txt -r requirements-dev.txt
python -m pytest -q tests        # backend: money paths, reconciliation, alerts
npm run build                    # frontend: typecheck and production build
```

The backend tests use an in-process fake supplier and a temporary database. They need no network,
Telegram token or supplier key. CI runs the same commands on every pull request.

The frontend has no automated browser tests yet. Before a release, check the customer and admin screens
at 320px and 390px width in a phone-sized browser.

## Operations

- **Alerts** go to Telegram: [docs/OPERATIONS.md](docs/OPERATIONS.md#1-alerts).
- **Backups** run through `scripts/backup.sh`, with monthly restore drills: [docs/OPERATIONS.md](docs/OPERATIONS.md#2-backups).
- **What to do** when an alert arrives or an order is stuck: [docs/RUNBOOK.md](docs/RUNBOOK.md).

Start every day with the check in the runbook. Orders in **Needs review** need a human when they are
flagged.

## Going live

Do not take real customer money until every item below is done.

- [ ] Real supplier orders tested end to end with small amounts, including a refund.
- [ ] Sign-in, the bot, support, and a deposit tested inside real Telegram.
- [ ] The migrations and orders tested against the production PostgreSQL database.
- [ ] `FLUX_DEMO_MODE` is `false` in Render; `ADMIN_TELEGRAM_IDS` lists only the real admins.
- [ ] The **Ops** page in the admin console shows `alerts_enabled: true`, and an alert reached every admin.
- [ ] Nightly backup running, and one restore drill passed.
- [ ] Terms, refund rules and privacy notice reviewed by a lawyer for each market you sell in.
- [ ] Every token pasted into chat or logs has been revoked and replaced.
- [ ] The admin team has read the [runbook](docs/RUNBOOK.md).

## License

Proprietary. All rights reserved unless a licence is added.
