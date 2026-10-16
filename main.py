import os, json, hmac, hashlib, time, secrets, sqlite3, logging, threading
from urllib.parse import parse_qsl
from contextlib import contextmanager
from psycopg.rows import dict_row
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, HTTPException, Header, Depends, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
import httpx
import asyncio
import re
from product_catalog import classify_product, image_for_product
from decimal import Decimal, ROUND_CEILING

logger = logging.getLogger("flux")
APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
IS_PRODUCTION = APP_ENV == "production"
# Render always sets RENDER. Treat it as a production signal so demo mode / SQLite
# fallback can never sneak in just because APP_ENV was forgotten.
ON_RENDER = bool(os.getenv("RENDER"))
ROOT = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL", "")
DB_PATH = os.getenv("DATABASE_PATH", os.path.join(ROOT, "flux.db"))
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
_admin_raw = os.getenv("ADMIN_TELEGRAM_IDS", "")
ADMIN_IDS = {int(x) for x in _admin_raw.split(",") if x.strip().isdigit()}
_bad_admin_entries = [x for x in _admin_raw.split(",") if x.strip() and not x.strip().isdigit()]
if _bad_admin_entries:
    logger.warning("Ignoring invalid ADMIN_TELEGRAM_IDS entries: %s", ", ".join(_bad_admin_entries))
TTL = int(os.getenv("PAYMENT_TTL_MINUTES", "20"))
WEBAPP_URL = os.getenv("FLUX_WEBAPP_URL", os.getenv("RENDER_EXTERNAL_URL", "")).rstrip("/")
BRAND_NAME = os.getenv("BRAND_NAME", "FLUX")
SUPPLIER_BASE = os.getenv("SUPPLIER_API_BASE", "https://api-geminipro.ignorelist.com/api/reseller/v1").rstrip("/")
SUPPLIER_API_KEY = os.getenv("SUPPLIER_API_KEY", "").strip()
CATALOG_SYNC_MINUTES = int(os.getenv("CATALOG_SYNC_MINUTES", "30"))
WEBHOOK_SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET", "").strip() or ("" if IS_PRODUCTION else secrets.token_urlsafe(32))
DEMO_MODE = os.getenv("FLUX_DEMO_MODE", "false").strip().lower() in ("true", "1", "yes", "on")
# Demo mode is a complete authentication bypass. It is only ever allowed on a
# local, non-Render, non-production process.
DEMO_ALLOWED = DEMO_MODE and not IS_PRODUCTION and not ON_RENDER
app = FastAPI(title="Store API", version="0.2.0")
FRONTEND_DIST = os.path.join(ROOT, "frontend_dist")
if os.path.isdir(os.path.join(FRONTEND_DIST, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="frontend-assets")

# ── Security headers on every response ────────────────────────────────────────
_CSP = (
    "default-src 'self'; "
    "script-src 'self' https://telegram.org; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' https://cdn.simpleicons.org data:; "
    "font-src 'self'; "
    "connect-src 'self'; "
    "frame-src https://*.telegram.org; "
    "base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'none'"
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if request.url.scheme == "https":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    content_type = response.headers.get("content-type", "")
    if "text/html" in content_type:
        response.headers.setdefault("Content-Security-Policy", _CSP)
    return response

class DatabaseAdapter:
    """Small compatibility layer so existing parameterized queries work on SQLite and PostgreSQL."""
    def __init__(self, connection, postgres=False):
        self.connection = connection
        self.postgres = postgres

    def execute(self, query, params=()):
        if self.postgres:
            query = query.replace("?", "%s")
        return self.connection.execute(query, params)

    def executemany(self, query, params_seq):
        if self.postgres:
            query = query.replace("?", "%s")
            with self.connection.cursor() as cursor:
                cursor.executemany(query, params_seq)
                return cursor.rowcount
        return self.connection.executemany(query, params_seq)

    def executescript(self, script):
        if not self.postgres:
            return self.connection.executescript(script)
        for statement in script.split(";"):
            if statement.strip():
                self.execute(statement)

_pg_pool = None
_pg_pool_lock = threading.Lock()


def _get_pg_pool():
    """Reuse PostgreSQL connections instead of paying a network handshake per query."""
    global _pg_pool
    if _pg_pool is None:
        with _pg_pool_lock:
            if _pg_pool is None:
                from psycopg_pool import ConnectionPool
                _pg_pool = ConnectionPool(
                    conninfo=DATABASE_URL,
                    min_size=1,
                    max_size=max(2, int(os.getenv("DB_POOL_MAX_SIZE", "8"))),
                    timeout=5,
                    kwargs={"row_factory": dict_row, "connect_timeout": 5},
                    open=False,
                )
                _pg_pool.open(wait=True)
    return _pg_pool


@contextmanager
def db():
    if DATABASE_URL:
        pool = _get_pg_pool()
        with pool.connection() as conn:
            c = DatabaseAdapter(conn, postgres=True)
            try:
                yield c
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        return

    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    c = DatabaseAdapter(conn, postgres=False)
    try:
        yield c
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _db_call(fn):
    with db() as c:
        return fn(c)


async def run_db(fn):
    """Run a synchronous DB unit of work on a worker thread so it never blocks the event loop."""
    return await asyncio.to_thread(_db_call, fn)


# ── Small in-memory rate limiter (per-process; good enough for one Render instance) ──
_rate_buckets: dict[str, list[float]] = {}
_rate_lock = threading.Lock()


def rate_limit(key: str, limit: int, window_seconds: int = 60):
    now = time.monotonic()
    with _rate_lock:
        bucket = _rate_buckets.setdefault(key, [])
        cutoff = now - window_seconds
        bucket[:] = [t for t in bucket if t > cutoff]
        if len(bucket) >= limit:
            raise HTTPException(429, "Too many requests. Please wait a moment and try again.")
        bucket.append(now)

def init_db():
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS users(telegram_id INTEGER PRIMARY KEY,username TEXT,first_name TEXT,balance_cents INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS topups(id TEXT PRIMARY KEY,telegram_id INTEGER NOT NULL,method TEXT NOT NULL,base_cents INTEGER NOT NULL,expected_millis INTEGER NOT NULL,status TEXT NOT NULL,reference TEXT NOT NULL,expires_at TEXT NOT NULL,tx_reference TEXT,created_at TEXT NOT NULL,reviewed_at TEXT);
        CREATE UNIQUE INDEX IF NOT EXISTS unique_pending_amount ON topups(method,expected_millis) WHERE status='pending';
        CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY,telegram_id INTEGER NOT NULL,delta_cents INTEGER NOT NULL,reason TEXT NOT NULL,reference TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,telegram_id INTEGER NOT NULL,product_id TEXT NOT NULL,price_cents INTEGER NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,delivery_note TEXT, idempotency_key TEXT);
        CREATE TABLE IF NOT EXISTS catalog(id INTEGER PRIMARY KEY,name TEXT NOT NULL,description TEXT,supplier_price TEXT NOT NULL,currency TEXT,stock INTEGER NOT NULL DEFAULT 0,in_stock INTEGER NOT NULL DEFAULT 0,enabled INTEGER NOT NULL DEFAULT 1,margin_percent REAL,markup_cents INTEGER,category TEXT NOT NULL DEFAULT 'Subscriptions',period TEXT NOT NULL DEFAULT 'one-time',tag TEXT,display_name TEXT,removed INTEGER NOT NULL DEFAULT 0,synced_at TEXT);
        CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS support_threads(id TEXT PRIMARY KEY,telegram_id INTEGER NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS support_messages(id TEXT PRIMARY KEY,thread_id TEXT NOT NULL,sender TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS ads(id TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT,cta TEXT,link_url TEXT,image_url TEXT,placement TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,ends_at TEXT,created_at TEXT NOT NULL);
        """)
        # Telegram IDs exceed PostgreSQL's signed 32-bit INTEGER range.
        # Convert existing production columns to BIGINT as an idempotent migration,
        # but only when the column is not already BIGINT (avoids a table rewrite per deploy).
        if c.postgres:
            for table in ("users", "topups", "ledger", "orders", "support_threads"):
                col = c.execute(
                    "SELECT data_type FROM information_schema.columns "
                    "WHERE table_name=%s AND column_name='telegram_id'", (table,)).fetchone()
                if col and col["data_type"] != "bigint":
                    c.execute(f"ALTER TABLE {table} ALTER COLUMN telegram_id TYPE BIGINT")
DEFAULT_SETTINGS = {
    "default_margin_percent": "20",
    "default_markup_cents": "0",
    "bybit_address": "",
    "telegram_wallet_address": "",
    "catalog_synced_at": "",
}

def ensure_column(c, table, column, decl):
    if c.postgres:
        c.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {decl}")
    else:
        cols = [r["name"] for r in c.execute(f"PRAGMA table_info({table})").fetchall()]
        if column not in cols:
            c.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")

def migrate_and_seed():
    with db() as c:
        ensure_column(c, "orders", "cost_cents", "INTEGER")
        ensure_column(c, "orders", "supplier_product_id", "INTEGER")
        ensure_column(c, "orders", "supplier_order_code", "TEXT")
        ensure_column(c, "orders", "review_note", "TEXT")
        ensure_column(c, "orders", "idempotency_key", "TEXT")
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS unique_order_idempotency ON orders(telegram_id, idempotency_key) WHERE idempotency_key IS NOT NULL")
        ensure_column(c, "catalog", "image_url", "TEXT")
        ensure_column(c, "catalog", "supplier_image", "TEXT")
        ensure_column(c, "catalog", "added_at", "TEXT")
        ensure_column(c, "catalog", "restocked_at", "TEXT")
        ensure_column(c, "catalog", "featured", "INTEGER NOT NULL DEFAULT 0")
        c.executescript("""        CREATE INDEX IF NOT EXISTS idx_catalog_public ON catalog(enabled, removed, category, name);
        CREATE INDEX IF NOT EXISTS idx_catalog_featured ON catalog(enabled, removed, in_stock, featured);
        CREATE INDEX IF NOT EXISTS idx_catalog_restocked ON catalog(enabled, removed, in_stock, restocked_at);
        CREATE INDEX IF NOT EXISTS idx_catalog_added ON catalog(enabled, removed, in_stock, added_at);
        CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(telegram_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at);
        CREATE INDEX IF NOT EXISTS idx_orders_supplier_status ON orders(supplier_order_code, status);
        CREATE INDEX IF NOT EXISTS idx_topups_user_created ON topups(telegram_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_support_messages_thread_created ON support_messages(thread_id, created_at);
""")
        for k, v in DEFAULT_SETTINGS.items():
            c.execute("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING", (k, v))

_database_ready = False


def bootstrap_database():
    """Create/migrate schema. Idempotent; safe to call more than once."""
    global _database_ready
    if _database_ready:
        return
    init_db()
    migrate_and_seed()
    _database_ready = True


if not IS_PRODUCTION:
    # Local, tests and dev: tables must exist at import time so tooling works.
    # In production the first startup handler validates config BEFORE touching the database.
    bootstrap_database()

class TopupCreate(BaseModel):
    amount: float = Field(gt=0, le=10000)
    method: str
class VerifyRequest(BaseModel):
    tx_reference: str = Field(min_length=3, max_length=160)
class AdminDecision(BaseModel):
    decision: str
    note: str | None = None
class OrderCreate(BaseModel):
    product_id: str
    idempotency_key: str | None = Field(default=None, min_length=16, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
class AdCreate(BaseModel):
    title: str = Field(min_length=2, max_length=80)
    body: str | None = Field(default=None, max_length=240)
    cta: str | None = Field(default=None, max_length=24)
    link_url: str | None = Field(default=None, max_length=500)
    image_url: str | None = Field(default=None, max_length=500)
    placement: str
    ends_at: str | None = None
class AdStatus(BaseModel):
    active: bool

PERIODS = {"month", "year", "one-time"}

class CatalogUpdate(BaseModel):
    enabled: bool | None = None
    margin_percent: float | None = Field(default=None, ge=0, le=500)
    markup_cents: int | None = Field(default=None, ge=0, le=100000)
    category: str | None = Field(default=None, min_length=1, max_length=40)
    period: str | None = None
    tag: str | None = Field(default=None, max_length=20)
    display_name: str | None = Field(default=None, max_length=80)
    image_url: str | None = Field(default=None, max_length=500)
    featured: bool | None = None

class SettingsUpdate(BaseModel):
    default_margin_percent: float | None = Field(default=None, ge=0, le=500)
    default_markup_cents: int | None = Field(default=None, ge=0, le=100000)
    bybit_address: str | None = Field(default=None, max_length=200)
    telegram_wallet_address: str | None = Field(default=None, max_length=200)

def validate_init(raw):
    if not BOT_TOKEN: raise HTTPException(503,"Telegram authentication is not configured")
    pairs=dict(parse_qsl(raw,keep_blank_values=True)); sig=pairs.pop("hash",None)
    if not sig: raise HTTPException(401,"Missing Telegram signature")
    try:
        if abs(time.time()-int(pairs.get("auth_date","0")))>86400: raise HTTPException(401,"Telegram session expired; reopen the Mini App")
    except (ValueError,TypeError): raise HTTPException(401,"Invalid Telegram auth date")
    data="\n".join(f"{k}={v}" for k,v in sorted(pairs.items()))
    secret=hmac.new(b"WebAppData",BOT_TOKEN.encode(),hashlib.sha256).digest()
    expected=hmac.new(secret,data.encode(),hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected,sig): raise HTTPException(401,"Invalid Telegram signature")
    try:
        u=json.loads(pairs["user"]); return {"id":int(u["id"]),"username":u.get("username",""),"first_name":u.get("first_name","Customer")}
    except Exception: raise HTTPException(401,"Invalid Telegram user data")

def current_user(authorization: str | None = Header(default=None)):
    if DEMO_MODE:
        if not DEMO_ALLOWED:
            # Demo mode is a full auth bypass; never allow it on a production/Render host.
            raise HTTPException(500, "Demo mode must be disabled in production")
        return {"id": 100000001, "username": "demo_user", "first_name": "Demo"}
    if not authorization or not authorization.startswith("tma "):
        raise HTTPException(401, "Open the app inside Telegram to continue")
    return validate_init(authorization[4:])

def ensure_user_row(c, u):
    c.execute("INSERT INTO users(telegram_id,username,first_name,created_at) VALUES(?,?,?,?) ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username,first_name=excluded.first_name",(u["id"],u.get("username",""),u.get("first_name","Customer"),datetime.now(timezone.utc).isoformat()))

def ensure_user(u):
    with db() as c:
        ensure_user_row(c, u)

def admin(u=Depends(current_user)):
    if u["id"] not in ADMIN_IDS: raise HTTPException(403,"Admin access required")
    return u

_telegram_http_client: httpx.AsyncClient | None = None
_supplier_http_client: httpx.AsyncClient | None = None
_background_tasks: list[asyncio.Task] = []


@app.on_event("startup")
async def initialize_http_clients():
    """Keep TLS connections alive; repeated bot/supplier calls avoid TCP/TLS handshakes."""
    global _telegram_http_client, _supplier_http_client
    limits = httpx.Limits(max_connections=30, max_keepalive_connections=12, keepalive_expiry=30)
    if _telegram_http_client is None:
        _telegram_http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, connect=4.0), limits=limits,
        )
    if _supplier_http_client is None:
        _supplier_http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(15.0, connect=4.0), limits=limits,
        )


@app.on_event("shutdown")
async def close_resources():
    global _telegram_http_client, _supplier_http_client, _pg_pool
    for task in _background_tasks:
        task.cancel()
    if _background_tasks:
        await asyncio.gather(*_background_tasks, return_exceptions=True)
    _background_tasks.clear()
    for client in (_telegram_http_client, _supplier_http_client):
        if client is not None:
            await client.aclose()
    _telegram_http_client = None
    _supplier_http_client = None
    if _pg_pool is not None:
        _pg_pool.close()
        _pg_pool = None


class TelegramApiError(Exception):
    """Telegram call failed. The message never contains the bot token or request URL."""


async def telegram_api(method, payload):
    if not BOT_TOKEN:
        raise RuntimeError("Telegram bot token is not configured")
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/{method}"
    try:
        if _telegram_http_client is not None:
            response = await _telegram_http_client.post(url, json=payload)
        else:
            async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=4.0)) as client:
                response = await client.post(url, json=payload)
    except httpx.HTTPError as exc:
        # Never let the exception text (which can embed the token-bearing URL) escape.
        raise TelegramApiError(f"Telegram API {method} network error ({type(exc).__name__})") from None
    if response.status_code >= 400:
        raise TelegramApiError(f"Telegram API {method} failed with HTTP {response.status_code}")
    result = response.json()
    if not result.get("ok"):
        raise TelegramApiError(f"Telegram API rejected {method}")
    return result.get("result")


def validate_production_config():
    """Fail closed instead of silently running with ephemeral storage or an unconfigured bot."""
    missing = []
    if not BOT_TOKEN:
        missing.append("TELEGRAM_BOT_TOKEN")
    if not WEBHOOK_SECRET:
        missing.append("TELEGRAM_WEBHOOK_SECRET")
    elif not re.fullmatch(r"[A-Za-z0-9_-]{1,256}", WEBHOOK_SECRET):
        missing.append("TELEGRAM_WEBHOOK_SECRET (use Telegram-supported characters)")
    if not ADMIN_IDS:
        missing.append("ADMIN_TELEGRAM_IDS")
    if not DATABASE_URL:
        missing.append("SUPABASE_DB_URL or DATABASE_URL (PostgreSQL required in production)")
    if not WEBAPP_URL.startswith("https://"):
        missing.append("FLUX_WEBAPP_URL (or valid RENDER_EXTERNAL_URL)")
    if not SUPPLIER_API_KEY:
        missing.append("SUPPLIER_API_KEY")
    if DEMO_MODE:
        missing.append("FLUX_DEMO_MODE=false")
    if missing:
        raise RuntimeError("Production configuration is incomplete: " + ", ".join(missing))


@app.on_event("startup")
async def startup_validate_and_migrate():
    """Production: validate config BEFORE creating/migrating any schema."""
    if IS_PRODUCTION or ON_RENDER:
        validate_production_config()
    bootstrap_database()


@app.on_event("startup")
async def configure_telegram_webhook():
    # Render exposes RENDER_EXTERNAL_URL automatically. Validate production before serving traffic.
    if IS_PRODUCTION:
        validate_production_config()
    if not BOT_TOKEN or not WEBAPP_URL.startswith("https://"):
        logger.warning("Telegram webhook not configured: bot token or public HTTPS URL is missing")
        return
    if not WEBHOOK_SECRET:
        raise RuntimeError("TELEGRAM_WEBHOOK_SECRET must be configured before registering the webhook")
    # Fixed path — the secret is ONLY ever sent in the X-Telegram-Bot-Api-Secret-Token
    # header, never in the URL, so it cannot leak through access logs or error alerts.
    target_url = WEBAPP_URL + "/telegram/webhook"
    try:
        await telegram_api("setMyCommands", {"commands": [
            {"command": "start", "description": "Open the store"},
            {"command": "balance", "description": "Check your wallet balance"},
            {"command": "orders", "description": "View your recent orders"},
            {"command": "help", "description": "Get help and safety guidance"}
        ]})
        await telegram_api("setWebhook", {
            "url": target_url,
            "secret_token": WEBHOOK_SECRET,
            "allowed_updates": ["message", "callback_query"]
        })
        info = await telegram_api("getWebhookInfo", {})
        if not info or info.get("url") != target_url:
            raise RuntimeError("Telegram did not confirm the configured webhook URL")
        if info.get("last_error_message"):
            logger.warning("Telegram reports a webhook delivery error: %s", info["last_error_message"])
        logger.info("Telegram webhook registered and verified; pending updates=%s", info.get("pending_update_count", 0))
    except Exception as exc:
        # Exception text can contain credentials or token-bearing request URLs.
        logger.error("Telegram webhook setup failed (%s)", type(exc).__name__)
        if IS_PRODUCTION:
            raise RuntimeError("Production startup failed: Telegram webhook could not be registered") from None


@app.post("/telegram/webhook")
async def telegram_webhook(update: dict, request: Request):
    # Telegram authenticates with the secret header. The path itself is not a credential.
    header_secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if not WEBHOOK_SECRET or not hmac.compare_digest(header_secret, WEBHOOK_SECRET):
        raise HTTPException(403, "Forbidden")
    if update.get("callback_query"):
        return await handle_callback(update["callback_query"])
    message = update.get("message") or {}
    chat = message.get("chat") or {}
    user = message.get("from") or {}
    text_in = (message.get("text") or "").strip()
    if not chat.get("id") or not text_in:
        return {"ok": True}
    command = text_in.split()[0].split("@")[0].lower()
    telegram_id = user.get("id")
    first = user.get("first_name") or "there"
    is_new = True
    if telegram_id:
        def _lookup(c):
            return c.execute("SELECT 1 FROM users WHERE telegram_id=?", (int(telegram_id),)).fetchone() is None
        is_new = await run_db(_lookup)
        await run_db(lambda c: ensure_user_row(c, {"id": int(telegram_id), "username": user.get("username", ""), "first_name": first}))
    keyboard = {"inline_keyboard": [[{"text": "Open store", "web_app": {"url": WEBAPP_URL}}]]} if WEBAPP_URL.startswith("https://") else None

    async def reply(message_text, markup=None):
        payload = {"chat_id": chat["id"], "text": message_text}
        if markup:
            payload["reply_markup"] = markup
        await telegram_api("sendMessage", payload)

    if command == "/start":
        if is_new:
            welcome = (
                f"Welcome to {BRAND_NAME}, {first}! 👋\n\n"
                "Your subscriptions, all in one simple place.\n\n"
                "🛍️ 1. Explore the available plans.\n"
                "💳 2. Add funds using the payment details shown in the app.\n"
                "🧾 3. Submit your payment reference for review.\n"
                "📦 4. Choose a plan and track your order in Orders.\n\n"
                "🔒 Wallet top-ups are checked by our team. Your balance updates after payment is confirmed.\n\n"
                "Need help? Send /help or message us here."
            )
        else:
            with db() as c:
                row = c.execute("SELECT balance_cents FROM users WHERE telegram_id=?", (int(telegram_id),)).fetchone()
            balance = (row["balance_cents"] if row else 0) / 100
            welcome = (
                f"Welcome back, {first}! 👋\n\n"
                f"Wallet balance: USD {balance:.2f}\n"
                "Open the store to browse plans, or send /orders to see your recent purchases."
            )
        if not keyboard:
            welcome += "\n\nThe app link is being configured. Please try again shortly."
        await reply(welcome, keyboard)
    elif command in ("/help", "/commands"):
        await reply(
            f"{BRAND_NAME} help\n\n"
            "/start — welcome and getting started\n"
            "/balance — your wallet balance\n"
            "/orders — your five latest orders\n"
            "/help — this list\n"
            "Just send a message here to contact support.\n\n"
            "Payments are reviewed by hand. Only send funds to the recipient details published in the app.\n"
            "Never share passwords, login codes, or recovery phrases with anyone, including people claiming to be support."
        )
    elif command == "/balance":
        with db() as c:
            row = c.execute("SELECT balance_cents FROM users WHERE telegram_id=?", (int(telegram_id),)).fetchone()
        await reply("Your wallet balance: USD " + format((row["balance_cents"] if row else 0) / 100, ".2f"))
    elif command == "/orders":
        with db() as c:
            rows = c.execute("SELECT id,product_id,status,created_at FROM orders WHERE telegram_id=? ORDER BY created_at DESC LIMIT 5", (int(telegram_id),)).fetchall()
        if not rows:
            await reply("You do not have any orders yet.")
        else:
            lines = ["Your latest orders:"]
            for row in rows:
                lines.append(f"• {row['id']} — {product_name_of(row['product_id'])} ({row['status'].replace('_', ' ')})")
            await reply("\n".join(lines), keyboard)
    elif command in ("/admin", "/pending", "/stats") and telegram_id in ADMIN_IDS:
        with db() as c:
            users_n = c.execute("SELECT COUNT(*) n FROM users").fetchone()["n"]
            orders_n = c.execute("SELECT COUNT(*) n FROM orders WHERE status!='refunded'").fetchone()["n"]
            pending_topups = c.execute("SELECT COUNT(*) n FROM topups WHERE status='pending'").fetchone()["n"]
            pending_orders = c.execute("SELECT COUNT(*) n FROM orders WHERE status IN ('pending_review','processing','needs_review')").fetchone()["n"]
            balance_n = c.execute("SELECT COALESCE(SUM(balance_cents),0) n FROM users").fetchone()["n"]
        if command == "/pending":
            with db() as c:
                rows = c.execute("SELECT id,telegram_id,method,base_cents,tx_reference FROM topups WHERE status='pending' ORDER BY created_at ASC LIMIT 15").fetchall()
            if not rows:
                await reply("No pending top-ups right now.")
            else:
                lines = ["Pending top-ups (verify funds before approving):"]
                for row in rows:
                    lines.append(f"{row['id']} · user {row['telegram_id']} · USD {row['base_cents']/100:.2f} · {row['method']} · ref: {row['tx_reference'] or 'not submitted'}")
                lines.append("Use the Verify buttons on each top-up alert, or open the dashboard.")
                await reply("\n".join(lines), admin_dashboard_markup())
        else:
            summary = (
                f"{BRAND_NAME} admin\n\n"
                f"Pending top-ups: {pending_topups}\n"
                f"Orders to review: {pending_orders}\n"
                f"Customers: {users_n} · Orders: {orders_n}\n"
                f"Wallet liabilities: USD {balance_n/100:.2f}"
            )
            if not admin_dashboard_markup():
                summary += "\n\nThe dashboard button needs an https FLUX_WEBAPP_URL to be set on the server."
            await reply(summary, admin_dashboard_markup())
    elif command in ("/approve", "/reject") and telegram_id in ADMIN_IDS:
        parts = text_in.split(maxsplit=1)
        if len(parts) != 2:
            await reply(f"Usage: {command} TP-XXXXXXXX")
        else:
            try:
                result = decide_topup_record(parts[1].strip().upper(), "approve" if command == "/approve" else "reject")
                await reply(f"Top-up {result['id']} marked {result['status']}.")
                if command == "/approve":
                    with db() as c:
                        row = c.execute("SELECT telegram_id,base_cents FROM topups WHERE id=?", (result["id"],)).fetchone()
                    try:
                        await telegram_api("sendMessage", {"chat_id": row["telegram_id"], "text": f"Your top-up {result['id']} has been approved. Wallet credit: USD {row['base_cents']/100:.2f}."})
                    except Exception:
                        pass
            except HTTPException as exc:
                await reply(f"Could not process top-up: {exc.detail}")
    elif command == "/close" and telegram_id in ADMIN_IDS:
        parts_ = text_in.split()
        if len(parts_) < 2:
            await reply("Usage: /close TH-XXXXXXXX")
        else:
            await support_close(parts_[1].upper(), telegram_id)
    elif command == "/cancel" and telegram_id in ADMIN_IDS:
        set_setting(f"support_reply:{telegram_id}", "")
        await reply("Reply mode cancelled.")
    elif not command.startswith("/"):
        if telegram_id in ADMIN_IDS:
            quoted = ((message.get("reply_to_message") or {}).get("text") or "")
            found = TICKET_RE.search(quoted)
            pending = get_setting(f"support_reply:{telegram_id}")
            tid = found.group(0) if found else pending
            if tid:
                await support_admin_reply(telegram_id, tid, text_in)
                if not found: set_setting(f"support_reply:{telegram_id}", "")
            else:
                await reply("To answer a customer, tap Reply on a support message, or reply to that message.")
        else:
            tid = await support_from_customer(telegram_id, first, user.get("username", ""), text_in)
            await reply(f"Thanks, our team has received your message ({tid}). We'll reply here.")
    elif command.startswith("/"):
        await reply("I did not recognize that command. Use /help for the command list.")
    return {"ok": True}

def admin_dashboard_markup():
    if not WEBAPP_URL.startswith("https://"):
        return None
    return {"inline_keyboard": [[{"text": "Open admin dashboard", "web_app": {"url": WEBAPP_URL + "/admin"}}]]}

def decide_topup_record(tid: str, decision: str, note: str | None = None):
    if decision not in ("approve", "reject"):
        raise HTTPException(400, "Decision must be approve or reject")
    with db() as c:
        row = c.execute("SELECT * FROM topups WHERE id=?", (tid,)).fetchone()
        if not row:
            raise HTTPException(404, "Top-up not found")
        if row["status"] != "pending":
            raise HTTPException(409, "Top-up has already been reviewed")
        now = datetime.now(timezone.utc).isoformat()
        claimed = c.execute("UPDATE topups SET status=?,reviewed_at=? WHERE id=? AND status='pending'",
                            (decision + "d", now, tid))
        if claimed.rowcount != 1:
            raise HTTPException(409, "Top-up has already been reviewed")
        if decision == "approve":
            c.execute("UPDATE users SET balance_cents=balance_cents+? WHERE telegram_id=?",
                      (row["base_cents"], row["telegram_id"]))
            c.execute("INSERT INTO ledger(id,telegram_id,delta_cents,reason,reference,created_at) VALUES(?,?,?,?,?,?)",
                      ("LG-" + secrets.token_hex(5), row["telegram_id"], row["base_cents"], "topup", tid, now))
    return {"id": tid, "status": decision + "d", "note": note}

@app.get("/favicon.svg")
def favicon():
    built_icon = os.path.join(FRONTEND_DIST, "favicon.svg")
    if os.path.isfile(built_icon):
        return FileResponse(built_icon, media_type="image/svg+xml")
    raise HTTPException(404, "Icon not found")

def spa_index():
    built = os.path.join(FRONTEND_DIST, "index.html")
    if not os.path.isfile(built):
        raise HTTPException(503, "Frontend is not built. Run: npm install && npm run build")
    return FileResponse(built, headers={"Cache-Control": "no-cache"})

@app.get("/")
def home():
    return spa_index()

@app.get("/admin")
@app.get("/admin/{rest:path}")
def admin_console(rest: str = ""):
    # The React app switches to the operations console when the path starts with /admin.
    # Every admin API call is still protected server-side by ADMIN_TELEGRAM_IDS.
    return spa_index()
@app.api_route("/health", methods=["GET", "HEAD"])
def health(): return {"status":"ok","service":"flux-api"}
@app.get("/api/config")
def config(): return {"brand":BRAND_NAME,"demo_mode":DEMO_MODE,"payment_ttl_minutes":TTL,"currency":"USD"}
_public_products_cache = {"expires_at": 0.0, "items": None}
_public_products_lock = threading.Lock()


def invalidate_public_products_cache():
    with _public_products_lock:
        _public_products_cache["expires_at"] = 0.0
        _public_products_cache["items"] = None


def public_products():
    now = time.monotonic()
    with _public_products_lock:
        cached = _public_products_cache["items"]
        if cached is not None and now < _public_products_cache["expires_at"]:
            return cached
        defaults = pricing_defaults()
        with db() as c:
            rows = c.execute("SELECT * FROM catalog WHERE enabled=1 AND removed=0 ORDER BY category, name").fetchall()
        items = [catalog_public_item(r, defaults) for r in rows]
        _public_products_cache["items"] = items
        _public_products_cache["expires_at"] = time.monotonic() + 5
        return items


@app.get("/api/products")
def products(response: Response, category: str | None = None, q: str | None = None):
    response.headers["Cache-Control"] = "public, max-age=5, stale-while-revalidate=15"
    items = public_products()
    if category and category.lower() not in ("all", "popular"):
        items = [p for p in items if p["category"].lower() == category.lower()]
    if category and category.lower() == "popular":
        items = [p for p in items if p.get("tag") in ("Popular", "Trending")]
    if q:
        needle = q.lower()
        items = [p for p in items if needle in (p["name"] + p["category"] + p["description"]).lower()]
    return items
@app.get("/api/me")
def me(u=Depends(current_user)):
    ensure_user(u)
    with db() as c:
        b=c.execute("SELECT balance_cents FROM users WHERE telegram_id=?",(u["id"],)).fetchone()["balance_cents"]
        n=c.execute("SELECT COUNT(*) n FROM orders WHERE telegram_id=?",(u["id"],)).fetchone()["n"]
    return {**u,"balance":b/100,"orders_count":n}
@app.get("/api/topups")
def my_topups(u=Depends(current_user)):
    ensure_user(u)
    with db() as c: rows=c.execute("SELECT id,method,base_cents,expected_millis,status,reference,expires_at,tx_reference,created_at FROM topups WHERE telegram_id=? ORDER BY created_at DESC LIMIT 30",(u["id"],)).fetchall()
    return [dict(r,amount=r["base_cents"]/100,expected_amount=r["expected_millis"]/1000) for r in rows]
@app.post("/api/topups")
def create_topup(b:TopupCreate,u=Depends(current_user)):
    rate_limit(f"topup:create:{u['id']}", 10)
    ensure_user(u); method=b.method.lower().strip()
    if method not in ("bybit","telegram_wallet"): raise HTTPException(400,"Choose Bybit or Telegram Wallet")
    recipient = get_setting("bybit_address" if method=="bybit" else "telegram_wallet_address")
    if not recipient: raise HTTPException(503,"This payment method is not set up yet. Please choose the other method.")
    if abs(b.amount-round(b.amount))>1e-9: raise HTTPException(400,"Custom top-ups must be whole-dollar amounts")
    cents=round(b.amount*100)
    with db() as c:
        pending = c.execute("SELECT COUNT(*) n FROM topups WHERE telegram_id=? AND status='pending'", (u["id"],)).fetchone()["n"]
        if pending >= 5:
            raise HTTPException(429,"You already have several pending top-ups. Review or wait for them to expire before creating more.")
        c.execute("UPDATE topups SET status='expired' WHERE status='pending' AND expires_at<=?", (datetime.now(timezone.utc).isoformat(),))
        for _ in range(100):
            expected=cents*10+secrets.randbelow(999)+1
            if not c.execute("SELECT 1 FROM topups WHERE method=? AND expected_millis=? AND status='pending'",(method,expected)).fetchone(): break
        else: raise HTTPException(503,"Could not reserve a unique amount; retry")
        tid="TP-"+secrets.token_hex(4).upper(); ref="FLX-"+secrets.token_hex(3).upper()
        now=datetime.now(timezone.utc); expiry=now+timedelta(minutes=TTL)
        try:
            c.execute("INSERT INTO topups(id,telegram_id,method,base_cents,expected_millis,status,reference,expires_at,created_at) VALUES(?,?,?,?,?,'pending',?,?,?)",(tid,u["id"],method,cents,expected,ref,expiry.isoformat(),now.isoformat()))
        except Exception:
            # Unique pending-amount race with another request: surface a clean retry instead of a 500.
            raise HTTPException(409,"Someone else reserved this amount at the same moment. Please retry.")
    return {"id":tid,"method":method,"method_label":METHOD_LABELS[method],"recipient":recipient,"currency":"USDT","base_amount":cents/100,"expected_amount":expected/1000,"reference":ref,"expires_at":expiry.isoformat(),"expires_in_seconds":TTL*60,"instructions":"Send exactly the amount shown, to the address shown. The exact amount is how we match your payment."}


# Only notify admins once per top-up (or when the customer submits a different reference),
# so repeated /verify calls cannot flood the admin channel.
_topup_last_notify: dict[str, tuple[str, float]] = {}
_topup_notify_lock = threading.Lock()


@app.post("/api/topups/{tid}/verify")
async def verify(tid:str,b:VerifyRequest,u=Depends(current_user)):
    rate_limit(f"topup:verify:{u['id']}", 6)
    tx_ref = b.tx_reference.strip()
    def _do(c):
        row=c.execute("SELECT * FROM topups WHERE id=? AND telegram_id=?",(tid,u["id"])).fetchone()
        if not row: raise HTTPException(404,"Top-up not found")
        if row["status"]!="pending": raise HTTPException(400,"This top-up is no longer pending")
        if row["expires_at"] <= datetime.now(timezone.utc).isoformat():
            c.execute("UPDATE topups SET status='expired' WHERE id=? AND status='pending'", (tid,))
            return {"status":"expired","message":"This payment request expired. Create a new request."}, None
        c.execute("UPDATE topups SET tx_reference=? WHERE id=?",(tx_ref,tid))
        return {"status":"pending","message":"Submitted for manual review. Wallet is credited only after an administrator confirms funds arrived."}, row
    result, row = await run_db(_do)
    if result is not None and result.get("status") == "expired":
        return result
    # De-duplicate admin notifications: same tid + same reference, at most one per 5 minutes.
    now = time.monotonic()
    with _topup_notify_lock:
        prev = _topup_last_notify.get(tid)
        should_notify = prev is None or prev[0] != tx_ref or (now - prev[1]) > 300
        if should_notify:
            _topup_last_notify[tid] = (tx_ref, now)
    if should_notify:
        await notify_admins_topup(tid)
    return result
@app.get("/api/orders")
def orders(u=Depends(current_user)):
    with db() as c: rows=c.execute("SELECT id,product_id,price_cents,status,created_at,delivery_note FROM orders WHERE telegram_id=? ORDER BY created_at DESC LIMIT 50",(u["id"],)).fetchall()
    return [dict(r,price=r["price_cents"]/100,product_name=product_name_of(r["product_id"])) for r in rows]
@app.post("/api/orders")
async def create_order(b:OrderCreate,u=Depends(current_user)):
    rate_limit(f"order:create:{u['id']}", 10)
    await run_db(lambda c: ensure_user_row(c, u))
    # A client-generated key makes network retries safe without charging twice.
    if b.idempotency_key:
        def _existing(c):
            return c.execute("SELECT id,status FROM orders WHERE telegram_id=? AND idempotency_key=?",
                             (u["id"], b.idempotency_key)).fetchone()
        existing = await run_db(_existing)
        if existing:
            return {"id": existing["id"], "status": existing["status"],
                    "message": "This purchase request was already received."}
    sid = parse_product_id(b.product_id)
    def _catalog_row(c):
        return c.execute("SELECT * FROM catalog WHERE id=? AND enabled=1 AND removed=0", (sid,)).fetchone()
    row = await run_db(_catalog_row)
    if not row: raise HTTPException(404, "Product not found")
    if not SUPPLIER_API_KEY: raise HTTPException(503, "Ordering is not available yet")
    try:
        live = (await supplier_request("GET", f"/products/{sid}")).get("product") or {}
    except SupplierError:
        raise HTTPException(503, "We couldn't reach the supplier. Please try again in a moment.")
    if not live.get("inStock") or int(live.get("stock") or 0) < 1:
        raise HTTPException(409, "This plan is sold out right now.")
    cost = cost_cents_of(live.get("price", row["supplier_price"]))
    sell = sell_cents(cost, row["margin_percent"], row["markup_cents"])
    oid = "OR-" + secrets.token_hex(4).upper(); now = datetime.now(timezone.utc).isoformat()
    def _debit_and_insert(c):
        updated = c.execute("UPDATE users SET balance_cents=balance_cents-? WHERE telegram_id=? AND balance_cents>=?", (sell, u["id"], sell))
        if updated.rowcount != 1: raise HTTPException(400, "Insufficient balance. Add funds first.")
        c.execute("INSERT INTO orders(id,telegram_id,product_id,price_cents,status,created_at,cost_cents,supplier_product_id,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?)",
                  (oid, u["id"], f"sup-{sid}", sell, "processing", now, cost, sid, b.idempotency_key))
        c.execute("INSERT INTO ledger(id,telegram_id,delta_cents,reason,reference,created_at) VALUES(?,?,?,?,?,?)",
                  ("LG-" + secrets.token_hex(5), u["id"], -sell, "order", oid, now))
    try:
        await run_db(_debit_and_insert)
    except Exception:
        # The unique index is the final guard against two simultaneous requests sharing a key.
        # If another request won the race, return that order rather than exposing a DB error.
        if b.idempotency_key:
            def _race(c):
                return c.execute("SELECT id,status FROM orders WHERE telegram_id=? AND idempotency_key=?",
                                 (u["id"], b.idempotency_key)).fetchone()
            existing = await run_db(_race)
            if existing:
                return {"id": existing["id"], "status": existing["status"],
                        "message": "This purchase request was already received."}
        raise
    try:
        resp = await supplier_request("POST", "/orders", json_body={"productId": sid, "quantity": 1})
    except SupplierError as err:
        if err.code in DEFINITE_FAILURES:
            reason = REFUND_REASONS.get(err.code, "The order could not be placed.")
            refund_order(oid, u["id"], sell, reason + " Your wallet has been refunded.")
            raise HTTPException(400, reason + " Your wallet has been refunded.")
        # Unclear: do not guess. Park it, then check the supplier's own records.
        mark_order(oid, "needs_review", CUSTOMER_PENDING_NOTE)
        if err.code == "supplier_purchase_failed":
            # The supplier said the purchase failed. First look for a record that says otherwise;
            # if there is none, the failure stands and the wallet is refunded now.
            await reconcile_unclear_orders(only_id=oid)
            def _still_review(c):
                return c.execute("SELECT status FROM orders WHERE id=?", (oid,)).fetchone()["status"] == "needs_review"
            if await run_db(_still_review):
                refund_order(oid, u["id"], sell, SUPPLIER_FAILED_NOTE)
        def _final_status(c):
            return c.execute("SELECT status FROM orders WHERE id=?", (oid,)).fetchone()["status"]
        st = await run_db(_final_status)
        if st == "refunded":
            raise HTTPException(400, SUPPLIER_FAILED_NOTE)
        return {"id": oid, "status": st, "message": "Delivered." if st == "delivered" else CUSTOMER_PENDING_NOTE}
    order = resp.get("order") or {}
    value = order.get("value")
    note = None if value in (None, "", "DELIVERED_DIGITAL_PRODUCT") else str(value)
    order_code = order.get("orderCode")
    if not order_code:
        # The supplier accepted the call but returned no order code. We cannot track or
        # confirm this order, so park it for an admin instead of leaving it stuck in
        # 'processing' with no supplier reference (a crash/restart window that used to
        # orphan customer funds until manual investigation).
        mark_order(oid, "needs_review", CUSTOMER_PENDING_NOTE)
        return {"id": oid, "status": "needs_review", "message": CUSTOMER_PENDING_NOTE}
    status = "delivered" if order.get("status") == "completed" else "processing"
    def _finalize(c):
        c.execute("UPDATE orders SET status=?, supplier_order_code=?, delivery_note=COALESCE(?,delivery_note) WHERE id=?",
                  (status, order_code, note, oid))
    await run_db(_finalize)
    return {"id": oid, "status": status, "message": "Delivered." if status == "delivered" else "Order placed. We'll update it shortly."}
@app.get("/api/admin/overview")
def admin_overview(u=Depends(admin)):
    with db() as c:
        users_n = c.execute("SELECT COUNT(*) n FROM users").fetchone()["n"]
        orders_n = c.execute("SELECT COUNT(*) n FROM orders").fetchone()["n"]
        pending_topups = c.execute("SELECT COUNT(*) n FROM topups WHERE status='pending'").fetchone()["n"]
        pending_orders = c.execute("SELECT COUNT(*) n FROM orders WHERE status IN ('pending_review','processing')").fetchone()["n"]
        balance_n = c.execute("SELECT COALESCE(SUM(balance_cents),0) n FROM users").fetchone()["n"]
        topup_total = c.execute("SELECT COALESCE(SUM(base_cents),0) n FROM topups WHERE status='approved'").fetchone()["n"]
    return {"users": users_n, "orders": orders_n, "pending_topups": pending_topups,
            "pending_orders": pending_orders, "wallet_liabilities": balance_n / 100,
            "approved_topups": topup_total / 100}

@app.get("/api/admin/users")
def admin_users(u=Depends(admin)):
    with db() as c:
        rows = c.execute("""SELECT u.telegram_id,u.username,u.first_name,u.balance_cents,u.created_at,
            (SELECT COUNT(*) FROM orders o WHERE o.telegram_id=u.telegram_id) AS orders_count
            FROM users u ORDER BY u.created_at DESC LIMIT 100""").fetchall()
    return [dict(r, balance=r["balance_cents"] / 100) for r in rows]

@app.get("/api/admin/orders")
def admin_orders(u=Depends(admin)):
    with db() as c:
        rows = c.execute("""SELECT o.*,u.username,u.first_name FROM orders o
            LEFT JOIN users u ON u.telegram_id=o.telegram_id ORDER BY o.created_at DESC LIMIT 100""").fetchall()
    return [dict(r, price=r["price_cents"] / 100, cost=(r["cost_cents"] or 0) / 100, product_name=product_name_of(r["product_id"])) for r in rows]

class AdminOrderDecision(BaseModel):
    status: str
    note: str | None = None

@app.post("/api/admin/orders/{oid}")
def admin_decide_order(oid: str, b: AdminOrderDecision, u=Depends(admin)):
    allowed = {"processing", "delivered", "rejected", "refunded"}
    if b.status not in allowed:
        raise HTTPException(400, "Choose processing, delivered, rejected, or refunded")
    now = datetime.now(timezone.utc).isoformat()
    with db() as c:
        row = c.execute("SELECT * FROM orders WHERE id=?", (oid,)).fetchone()
        if not row:
            raise HTTPException(404, "Order not found")
        previous = row["status"]
        if previous == "refunded":
            raise HTTPException(409, "This order has already been refunded")
        if previous == "delivered" and b.status != "delivered":
            raise HTTPException(409, "Delivered orders cannot be changed or refunded here")
        if b.status == "refunded":
            claimed = c.execute("UPDATE orders SET status='refunded', delivery_note=COALESCE(?,delivery_note) WHERE id=? AND status IN ('pending_review','processing','rejected','needs_review')",
                                (b.note, oid))
            if claimed.rowcount != 1:
                raise HTTPException(409, "This order cannot be refunded from its current state")
            c.execute("UPDATE users SET balance_cents=balance_cents+? WHERE telegram_id=?",
                      (row["price_cents"], row["telegram_id"]))
            c.execute("INSERT INTO ledger(id,telegram_id,delta_cents,reason,reference,created_at) VALUES(?,?,?,?,?,?)",
                      ("LG-" + secrets.token_hex(5), row["telegram_id"], row["price_cents"], "order_refund", "REFUND-" + oid, now))
            return {"id": oid, "previous_status": previous, "status": "refunded"}
        c.execute("UPDATE orders SET status=?,delivery_note=COALESCE(?,delivery_note) WHERE id=?",
                  (b.status, b.note, oid))
    return {"id": oid, "previous_status": previous, "status": b.status}

@app.get("/api/admin/topups")
def admin_topups(u=Depends(admin)):
    with db() as c: rows=c.execute("SELECT * FROM topups ORDER BY created_at DESC LIMIT 100").fetchall()
    return [dict(r) for r in rows]
@app.post("/api/admin/topups/{tid}")
def decide_topup(tid: str, b: AdminDecision, u=Depends(admin)):
    return decide_topup_record(tid, b.decision, b.note)

# ── Sponsored ads ──────────────────────────────────────────────────────────
AD_PLACEMENTS = {"home", "shop"}

def clean_https(value, label):
    if value is None or not value.strip():
        return None
    value = value.strip()
    if not value.startswith("https://") or len(value) > 500:
        raise HTTPException(400, f"{label} must be a secure https:// link")
    return value

@app.get("/api/ads")
def public_ads(placement: str = "home"):
    if placement not in AD_PLACEMENTS:
        raise HTTPException(400, "Unknown placement")
    now = datetime.now(timezone.utc).isoformat()
    with db() as c:
        rows = c.execute(
            "SELECT id,title,body,cta,link_url,image_url,placement,ends_at FROM ads "
            "WHERE active=? AND placement=? AND (ends_at IS NULL OR ends_at>?) ORDER BY created_at DESC LIMIT 3",
            (1, placement, now)).fetchall()
    return [dict(r) for r in rows]

@app.get("/api/admin/ads")
def admin_ads(u=Depends(admin)):
    with db() as c:
        rows = c.execute("SELECT * FROM ads ORDER BY created_at DESC LIMIT 100").fetchall()
    return [dict(r, active=bool(r["active"])) for r in rows]

@app.post("/api/admin/ads")
def admin_create_ad(b: AdCreate, u=Depends(admin)):
    if b.placement not in AD_PLACEMENTS:
        raise HTTPException(400, "Placement must be home or shop")
    ends = None
    if b.ends_at and b.ends_at.strip():
        try:
            parsed = datetime.fromisoformat(b.ends_at.strip())
        except ValueError:
            raise HTTPException(400, "End date must look like 2026-12-31")
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        ends = parsed.astimezone(timezone.utc).isoformat()
    aid = "AD-" + secrets.token_hex(4).upper()
    with db() as c:
        c.execute(
            "INSERT INTO ads(id,title,body,cta,link_url,image_url,placement,active,ends_at,created_at) VALUES(?,?,?,?,?,?,?,1,?,?)",
            (aid, b.title.strip(), (b.body or "").strip() or None, (b.cta or "").strip() or None,
             clean_https(b.link_url, "Link"), clean_https(b.image_url, "Image"),
             b.placement, ends, datetime.now(timezone.utc).isoformat()))
    return {"id": aid}

@app.post("/api/admin/ads/{ad_id}")
def admin_set_ad_status(ad_id: str, b: AdStatus, u=Depends(admin)):
    with db() as c:
        cur = c.execute("UPDATE ads SET active=? WHERE id=?", (1 if b.active else 0, ad_id))
        if cur.rowcount != 1:
            raise HTTPException(404, "Ad not found")
    return {"id": ad_id, "active": b.active}

@app.delete("/api/admin/ads/{ad_id}")
def admin_delete_ad(ad_id: str, u=Depends(admin)):
    with db() as c:
        cur = c.execute("DELETE FROM ads WHERE id=?", (ad_id,))
        if cur.rowcount != 1:
            raise HTTPException(404, "Ad not found")
    return {"id": ad_id, "deleted": True}

# ── Admin dashboard ────────────────────────────────────────────────────────
def _last_days(n):
    today = datetime.now(timezone.utc).date()
    return [(today - timedelta(days=i)).isoformat() for i in range(n - 1, -1, -1)]

def _product_name(pid):
    return product_name_of(pid)

@app.get("/api/admin/dashboard")
def admin_dashboard(u=Depends(admin)):
    now = datetime.now(timezone.utc)
    days = _last_days(14)
    since = days[0] + "T00:00:00"
    with db() as c:
        def one(sql, params=()):
            return c.execute(sql, params).fetchone()["n"]

        totals = {
            "users": one("SELECT COUNT(*) n FROM users"),
            "orders": one("SELECT COUNT(*) n FROM orders WHERE status!='refunded'"),
            "revenue": one("SELECT COALESCE(SUM(price_cents),0) n FROM orders WHERE status!='refunded'") / 100,
            "profit": one("SELECT COALESCE(SUM(price_cents-COALESCE(cost_cents,0)),0) n FROM orders WHERE status!='refunded'") / 100,
            "paying_customers": one("SELECT COUNT(DISTINCT telegram_id) n FROM orders WHERE status!='refunded'"),
            "pending_topups": one("SELECT COUNT(*) n FROM topups WHERE status='pending'"),
            "pending_orders": one("SELECT COUNT(*) n FROM orders WHERE status IN ('pending_review','processing')"),
            "wallet_liabilities": one("SELECT COALESCE(SUM(balance_cents),0) n FROM users") / 100,
            "approved_topups": one("SELECT COALESCE(SUM(base_cents),0) n FROM topups WHERE status='approved'") / 100,
            "live_ads": one("SELECT COUNT(*) n FROM ads WHERE active=? AND (ends_at IS NULL OR ends_at>?)", (1, now.isoformat())),
        }

        order_days = {r["d"]: r for r in c.execute(
            "SELECT substr(created_at,1,10) d, COUNT(*) n, COALESCE(SUM(price_cents),0) s FROM orders "
            "WHERE created_at>=? AND status!='refunded' GROUP BY d", (since,)).fetchall()}
        user_days = {r["d"]: r["n"] for r in c.execute(
            "SELECT substr(created_at,1,10) d, COUNT(*) n FROM users WHERE created_at>=? GROUP BY d", (since,)).fetchall()}
        series = []
        for d in days:
            o = order_days.get(d)
            series.append({"date": d, "orders": o["n"] if o else 0,
                           "revenue": (o["s"] if o else 0) / 100, "customers": user_days.get(d, 0)})

        status_breakdown = [{"status": r["status"], "count": r["n"]} for r in c.execute(
            "SELECT status, COUNT(*) n FROM orders GROUP BY status ORDER BY n DESC").fetchall()]
        top_products = [{"product_id": r["product_id"], "name": _product_name(r["product_id"]),
                         "orders": r["n"], "revenue": r["s"] / 100} for r in c.execute(
            "SELECT product_id, COUNT(*) n, COALESCE(SUM(price_cents),0) s FROM orders "
            "WHERE status!='refunded' GROUP BY product_id ORDER BY n DESC LIMIT 5").fetchall()]
        order_rows = c.execute(
            "SELECT o.id,o.product_id,o.price_cents,o.status,o.created_at,u.first_name,u.username "
            "FROM orders o LEFT JOIN users u ON u.telegram_id=o.telegram_id ORDER BY o.created_at DESC LIMIT 8").fetchall()
        topup_rows = c.execute(
            "SELECT t.id,t.base_cents,t.method,t.status,t.created_at,u.first_name,u.username "
            "FROM topups t LEFT JOIN users u ON u.telegram_id=t.telegram_id ORDER BY t.created_at DESC LIMIT 8").fetchall()

    recent = []
    for r in order_rows:
        recent.append({"kind": "order", "id": r["id"], "title": _product_name(r["product_id"]),
                       "subtitle": r["first_name"] or r["username"] or "Customer", "status": r["status"],
                       "amount": r["price_cents"] / 100, "at": r["created_at"]})
    for r in topup_rows:
        recent.append({"kind": "topup", "id": r["id"], "title": f"Top-up · {r['method'].replace('_', ' ').title()}",
                       "subtitle": r["first_name"] or r["username"] or "Customer", "status": r["status"],
                       "amount": r["base_cents"] / 100, "at": r["created_at"]})
    recent.sort(key=lambda x: x["at"], reverse=True)

    return {"generated_at": now.isoformat(), "totals": totals, "series": series,
            "status_breakdown": status_breakdown, "top_products": top_products, "recent": recent[:10]}

# ── Settings helpers ───────────────────────────────────────────────────────
METHOD_LABELS = {"bybit": "Bybit UID transfer", "telegram_wallet": "Telegram Wallet"}
ACCENTS = ["green", "mint", "red", "orange", "purple", "blue"]

def get_setting(key):
    with db() as c:
        row = c.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return row["value"] if row else DEFAULT_SETTINGS.get(key, "")

def set_setting(key, value):
    with db() as c:
        c.execute("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, str(value)))

def pricing_defaults():
    with db() as c:
        rows = c.execute(
            "SELECT key,value FROM settings WHERE key IN (?,?)",
            ("default_margin_percent", "default_markup_cents"),
        ).fetchall()
    values = {r["key"]: r["value"] for r in rows}
    return (
        float(values.get("default_margin_percent") or DEFAULT_SETTINGS["default_margin_percent"]),
        int(float(values.get("default_markup_cents") or DEFAULT_SETTINGS["default_markup_cents"])),
    )

# ── Pricing: what the supplier charges us, and what we charge the customer ──
def cost_cents_of(price):
    return int((Decimal(str(price)) * 100).to_integral_value(rounding=ROUND_CEILING))

def sell_cents(cost, margin, markup, defaults=None):
    dm, dk = defaults or pricing_defaults()
    m = Decimal(str(dm if margin is None else margin))
    k = Decimal(str(dk if markup is None else markup))
    return int((Decimal(cost) * (1 + m / 100) + k).to_integral_value(rounding=ROUND_CEILING))

def parse_product_id(pid):
    if not pid.startswith("sup-") or not pid[4:].isdigit():
        raise HTTPException(404, "Product not found")
    return int(pid[4:])

def product_name_of(pid):
    try:
        sid = parse_product_id(pid)
    except HTTPException:
        return pid
    with db() as c:
        row = c.execute("SELECT name, display_name FROM catalog WHERE id=?", (sid,)).fetchone()
    return (row["display_name"] or row["name"]) if row else pid

# Sticker artwork used when a plan has no product image.
STICKERS = [("spotify", "🎵"), ("music", "🎵"), ("gemini", "✨"), ("chatgpt", "🤖"), ("gpt", "🤖"), ("openai", "🤖"),
            ("ai", "🤖"), ("netflix", "🎬"), ("youtube", "🎬"), ("video", "🎬"), ("adobe", "🎨"), ("design", "🎨"),
            ("canva", "🖌️"), ("game", "🎮"), ("gaming", "🎮"), ("points", "🎮"), ("cloud", "☁️"), ("storage", "☁️"),
            ("drive", "☁️"), ("vpn", "🛡️"), ("office", "📄"), ("microsoft", "📄")]

def sticker_for(name, category):
    text = f"{name} {category}".lower()
    for word, emoji in STICKERS:
        if re.search(rf"\b{re.escape(word)}\b", text):
            return emoji
    return "⭐"

def catalog_public_item(r, defaults):
    cost = cost_cents_of(r["supplier_price"])
    return {
        "id": f"sup-{r['id']}", "name": r["display_name"] or r["name"], "category": r["category"],
        "description": r["description"] or "",
        "price": sell_cents(cost, r["margin_percent"], r["markup_cents"], defaults) / 100,
        "period": r["period"], "icon": (r["name"] or "?")[:1].upper(), "accent": ACCENTS[r["id"] % len(ACCENTS)],
        "tag": r["tag"], "features": [], "in_stock": bool(r["in_stock"]) and (r["stock"] or 0) > 0,
        "image_url": r["image_url"] or r["supplier_image"] or None,
        "sticker": sticker_for(r["name"], r["category"]),
    }

# ── Supplier client ────────────────────────────────────────────────────────
class SupplierError(Exception):
    def __init__(self, status, code, message=""):
        super().__init__(code)
        self.status, self.code, self.message = status, code, message

# Errors that guarantee the supplier did not charge us, so the customer can be refunded safely.
DEFINITE_FAILURES = {"insufficient_funds", "out_of_stock", "product_not_found", "invalid_product_id",
                     "invalid_quantity", "invalid_order_payload", "invalid_api_key", "missing_api_key", "invalid_json"}
REFUND_REASONS = {
    "insufficient_funds": "The store's supplier balance is low right now, so the order was not placed.",
    "out_of_stock": "This plan sold out just before your purchase.",
    "product_not_found": "This plan is no longer available.",
    "invalid_product_id": "This plan is no longer available.",
    "invalid_api_key": "The store's supplier connection needs attention.",
    "missing_api_key": "The store's supplier connection needs attention.",
}

async def supplier_request(method, path, json_body=None):
    if not SUPPLIER_API_KEY:
        raise SupplierError(0, "not_configured", "SUPPLIER_API_KEY is not set")
    url = SUPPLIER_BASE + path
    headers = {"X-API-Key": SUPPLIER_API_KEY, "Accept": "application/json"}
    try:
        if _supplier_http_client is not None:
            r = await _supplier_http_client.request(method, url, headers=headers, json=json_body)
        else:
            async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=4.0)) as client:
                r = await client.request(method, url, headers=headers, json=json_body)
    except httpx.HTTPError as exc:
        raise SupplierError(0, "network", type(exc).__name__)
    try:
        data = r.json()
    except ValueError:
        data = {}
    if not isinstance(data, dict):
        data = {}
    if r.status_code >= 400 or data.get("ok") is False:
        raise SupplierError(r.status_code, data.get("error") or f"http_{r.status_code}", data.get("message") or "")
    return data

async def sync_catalog():
    """Fetch once, then upsert the catalogue in batches to reduce database round trips."""
    data = await supplier_request("GET", "/products")
    items = data.get("products") or []
    now = datetime.now(timezone.utc).isoformat()
    with db() as c:
        existing_rows = c.execute("SELECT id, in_stock FROM catalog").fetchall()
        previous = {r["id"]: r["in_stock"] for r in existing_rows}
        existing = set(previous)
        seen, added, upserts = set(), 0, []
        for it in items:
            try:
                pid = int(it.get("productId") or it.get("id"))
            except (TypeError, ValueError):
                continue
            if pid <= 0:
                continue
            seen.add(pid)
            is_new = pid not in existing
            if is_new:
                added += 1
            product_name = str(it.get("name") or it.get("title") or f"Product {pid}")[:500]
            product_description = str(it.get("description") or "")[:5000]
            auto_category = classify_product(product_name, product_description)
            auto_image = image_for_product(product_name, auto_category)
            supplier_image = next(
                (str(it[k])[:500] for k in ("image", "imageUrl", "thumbnail")
                 if str(it.get(k) or "").startswith("https://")),
                None,
            )
            stock = max(0, int(it.get("stock") or 0))
            in_stock = 1 if it.get("inStock") and stock > 0 else 0
            added_at = now if is_new else None
            restocked_at = now if (not is_new and not previous.get(pid, 0) and in_stock) else None
            upserts.append((
                pid, product_name, product_description, str(it.get("price") or "0")[:80],
                str(it.get("currency") or "USD")[:12], stock, in_stock, now, auto_category,
                supplier_image, auto_image, added_at, restocked_at,
            ))
        if upserts:
            c.executemany("""INSERT INTO catalog(
                    id,name,description,supplier_price,currency,stock,in_stock,synced_at,category,
                    supplier_image,image_url,added_at,restocked_at
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    description=excluded.description,
                    supplier_price=excluded.supplier_price,
                    currency=excluded.currency,
                    stock=excluded.stock,
                    in_stock=excluded.in_stock,
                    synced_at=excluded.synced_at,
                    removed=0,
                    category=CASE WHEN catalog.category='Subscriptions' THEN excluded.category ELSE catalog.category END,
                    supplier_image=excluded.supplier_image,
                    image_url=CASE WHEN catalog.image_url IS NULL OR catalog.image_url=''
                        THEN COALESCE(excluded.image_url,catalog.image_url) ELSE catalog.image_url END,
                    added_at=COALESCE(catalog.added_at,excluded.added_at),
                    restocked_at=COALESCE(excluded.restocked_at,catalog.restocked_at)""", upserts)
        gone = existing - seen
        if gone:
            c.executemany("UPDATE catalog SET removed=1, in_stock=0 WHERE id=?", ((pid,) for pid in gone))
    set_setting("catalog_synced_at", now)
    invalidate_public_products_cache()
    return {"synced": len(upserts), "added": added, "removed": len(gone)}

def refund_order(oid, telegram_id, cents, reason):
    """Refund exactly once. The status change and the credit share one transaction, and the
    UPDATE only matches while the order is still refundable, so a retry can never pay twice.
    Returns False if the order was already refunded or can no longer be refunded."""
    now = datetime.now(timezone.utc).isoformat()
    with db() as c:
        claimed = c.execute("UPDATE orders SET status='refunded', delivery_note=? WHERE id=? AND status IN ('pending_review','processing','needs_review')",
                            (reason, oid))
        if claimed.rowcount != 1:
            return False
        c.execute("UPDATE users SET balance_cents=balance_cents+? WHERE telegram_id=?", (cents, telegram_id))
        c.execute("INSERT INTO ledger(id,telegram_id,delta_cents,reason,reference,created_at) VALUES(?,?,?,?,?,?)",
                  ("LG-" + secrets.token_hex(5), telegram_id, cents, "order_refund", "REFUND-" + oid, now))
    return True

def mark_order(oid, status, note=None):
    with db() as c:
        c.execute("UPDATE orders SET status=?, delivery_note=COALESCE(?,delivery_note) WHERE id=?", (status, note, oid))

# ── Unclear supplier results ────────────────────────────────────────────────
# These errors do not prove whether the supplier charged us. We never refund or deliver on
# guesswork: we look for the order in the supplier's own list and decide from that.
UNCLEAR_CODES = {"supplier_purchase_pending", "transaction_error", "supplier_purchase_failed"}
FAILED_STATUSES = {"failed", "cancelled", "canceled", "refunded", "error", "rejected", "declined"}
UNCLEAR_GRACE = timedelta(minutes=15)   # how long to wait before saying "supplier has no record"
MATCH_WINDOW = timedelta(minutes=2)     # supplier orders created this close to our attempt are candidates
CUSTOMER_PENDING_NOTE = "We're confirming this order with the supplier. You'll see the result here shortly."
SUPPLIER_FAILED_NOTE = "The supplier could not complete this order. Your wallet has been refunded."

def parse_ts(value):
    try:
        d = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None

async def reconcile_unclear_orders(only_id=None):
    """Resolve needs_review orders by matching them to the supplier's own order list.
    - Exactly one unclaimed supplier order for the same product, created just after our attempt:
      adopt it. Completed or still processing -> processing (sync delivers it); failed -> refund.
    - Several candidates, or one candidate claimed by two of our orders: leave for an admin.
    - No candidate after the grace period: the supplier has no record, so flag it for the admin
      to confirm before refunding. Nothing is refunded automatically here."""
    with db() as c:
        # Also pick up 'processing' orders that never received a supplier_order_code
        # (crash/restart between our debit and the supplier response) — without this they
        # were stuck forever with the customer's money debited.
        sql = ("SELECT id,telegram_id,supplier_product_id,price_cents,created_at,supplier_order_code FROM orders "
               "WHERE supplier_product_id IS NOT NULL AND "
               "(status='needs_review' OR (status='processing' AND supplier_order_code IS NULL))")
        params = ()
        if only_id:
            sql += " AND id=?"; params = (only_id,)
        rows = [dict(r) for r in c.execute(sql, params).fetchall()]
        linked = {r["supplier_order_code"] for r in c.execute("SELECT supplier_order_code FROM orders WHERE supplier_order_code IS NOT NULL").fetchall()}
    report = {"checked": len(rows), "delivering": 0, "refunded": 0, "waiting": 0, "flagged": 0, "ambiguous": 0}
    if not rows:
        return report
    try:
        remote = (await supplier_request("GET", "/orders")).get("orders") or []
    except SupplierError:
        report["supplier"] = "unreachable"
        return report
    remote = [o for o in remote if o.get("orderCode")]
    now = datetime.now(timezone.utc)
    candidates = {}
    for r in rows:
        t0 = parse_ts(r["created_at"]) or now
        candidates[r["id"]] = [o for o in remote
                               if o["orderCode"] not in linked
                               and o.get("productId") == r["supplier_product_id"]
                               and int(o.get("quantity") or 1) == 1
                               and (parse_ts(o.get("createdAt")) or t0) >= t0 - MATCH_WINDOW]
    usage = {}
    for found in candidates.values():
        for o in found:
            usage[o["orderCode"]] = usage.get(o["orderCode"], 0) + 1
    for r in rows:
        found = candidates[r["id"]]
        if len(found) > 1 or any(usage[o["orderCode"]] > 1 for o in found):
            report["ambiguous"] += 1
            continue
        if found:
            o = found[0]
            if str(o.get("status") or "").lower() in FAILED_STATUSES:
                if refund_order(r["id"], r["telegram_id"], r["price_cents"], SUPPLIER_FAILED_NOTE):
                    report["refunded"] += 1
            else:
                with db() as c:
                    c.execute("UPDATE orders SET status='processing', supplier_order_code=?, review_note=NULL WHERE id=? AND status IN ('needs_review','processing')",
                              (o["orderCode"], r["id"]))
                report["delivering"] += 1
            continue
        t0 = parse_ts(r["created_at"]) or now
        if now - t0 >= UNCLEAR_GRACE:
            with db() as c:
                c.execute("UPDATE orders SET review_note=? WHERE id=?",
                          ("Supplier has no record of this order after 15 minutes. Check the supplier panel, then refund or mark delivered.", r["id"]))
            report["flagged"] += 1
        else:
            report["waiting"] += 1
    return report

async def sync_supplier_orders():
    with db() as c:
        rows = [dict(r) for r in c.execute(
            "SELECT id, telegram_id, price_cents, supplier_order_code FROM orders "
            "WHERE supplier_order_code IS NOT NULL AND status='processing'"
        ).fetchall()]
    semaphore = asyncio.Semaphore(5)

    async def fetch_status(row):
        async with semaphore:
            try:
                order = (await supplier_request("GET", f"/orders/{row['supplier_order_code']}")).get("order") or {}
                return row, order
            except SupplierError:
                return row, None

    results = await asyncio.gather(*(fetch_status(row) for row in rows))
    updated = 0
    for row, order in results:
        if order is None:
            continue
        status = str(order.get("status") or "").lower()
        if status == "completed":
            value = order.get("value")
            note = None if value in (None, "", "DELIVERED_DIGITAL_PRODUCT") else str(value)
            with db() as c:
                cur = c.execute(
                    "UPDATE orders SET status='delivered', delivery_note=COALESCE(?,delivery_note) "
                    "WHERE id=? AND status='processing'",
                    (note, row["id"]),
                )
            updated += cur.rowcount
        elif status in FAILED_STATUSES:
            if refund_order(row["id"], row["telegram_id"], row["price_cents"], SUPPLIER_FAILED_NOTE):
                updated += 1
    return updated

async def _reconcile_loop():
    while True:
        try:
            if SUPPLIER_API_KEY:
                OPS["last_reconcile_report"] = await reconcile_unclear_orders()
                await sync_supplier_orders()
                OPS["last_reconcile"] = datetime.now(timezone.utc).isoformat()
        except Exception as exc:
            print(f"Order reconciliation failed: {type(exc).__name__}: {exc}")
            await alert_admins("reconcile-error", f"Order reconciliation failed: {type(exc).__name__}. Orders may stay in 'Needs review' until this is fixed.")
        await asyncio.sleep(120)

async def _catalog_loop():
    while True:
        try:
            if SUPPLIER_API_KEY:
                await sync_catalog()
                OPS["last_catalog_sync"] = datetime.now(timezone.utc).isoformat()
                OPS["catalog_failures"] = 0
        except Exception as exc:
            OPS["catalog_failures"] += 1
            print(f"Catalogue sync failed: {type(exc).__name__}: {exc}")
            if OPS["catalog_failures"] >= 3:
                await alert_admins("catalog-sync", f"Catalogue sync has failed {OPS['catalog_failures']} times in a row ({type(exc).__name__}). Check SUPPLIER_API_KEY and the supplier status.")
        await asyncio.sleep(max(1, CATALOG_SYNC_MINUTES) * 60)

# ── Operations: health checks and admin alerts ──────────────────────────────
OPS = {"last_catalog_sync": None, "catalog_failures": 0, "last_reconcile": None, "last_reconcile_report": None}
OPS_ALERT_COOLDOWN = timedelta(minutes=int(os.getenv("OPS_ALERT_COOLDOWN_MINUTES", "60")))
OPS_STUCK_MINUTES = int(os.getenv("OPS_STUCK_MINUTES", "30"))
OPS_TOPUP_STALE_HOURS = int(os.getenv("OPS_TOPUP_STALE_HOURS", "12"))
SUPPLIER_LOW_BALANCE = float(os.getenv("SUPPLIER_LOW_BALANCE", "0") or 0)
_last_alert_at = {}

async def alert_admins(key, text):
    """Message every admin on Telegram. The same key is sent at most once per cooldown,
    so a broken supplier cannot flood anyone's chat."""
    now = datetime.now(timezone.utc)
    last = _last_alert_at.get(key)
    if last and now - last < OPS_ALERT_COOLDOWN:
        return False
    _last_alert_at[key] = now
    print(f"ALERT [{key}] {text}")
    for admin_id in sorted(ADMIN_IDS):
        try:
            await telegram_api("sendMessage", {"chat_id": admin_id, "text": f"FLUX alert\n\n{text}"[:3800]})
        except Exception as exc:
            print(f"Could not send alert to admin: {type(exc).__name__}")
    return True

def ops_snapshot():
    """Counts that decide whether an admin needs to act. Reads only; changes nothing."""
    now = datetime.now(timezone.utc)
    def minutes_old(iso):
        t = parse_ts(iso)
        return (now - t).total_seconds() / 60 if t else 0
    with db() as c:
        orders = [dict(r) for r in c.execute("SELECT id,status,created_at,review_note FROM orders WHERE status IN ('needs_review','processing')").fetchall()]
        topups = [dict(r) for r in c.execute("SELECT id,created_at FROM topups WHERE status='pending'").fetchall()]
    review = [o for o in orders if o["status"] == "needs_review"]
    processing = [o for o in orders if o["status"] == "processing"]
    return {
        "needs_review": len(review),
        "needs_review_over_limit": sum(1 for o in review if minutes_old(o["created_at"]) >= OPS_STUCK_MINUTES),
        "flagged_no_supplier_record": sum(1 for o in review if o["review_note"]),
        "processing_over_limit": sum(1 for o in processing if minutes_old(o["created_at"]) >= OPS_STUCK_MINUTES),
        "pending_topups": len(topups),
        "topups_over_limit": sum(1 for t in topups if minutes_old(t["created_at"]) >= OPS_TOPUP_STALE_HOURS * 60),
    }

async def ops_check():
    """Look for anything that needs an admin, and send one digest if there is. Safe to run often."""
    snap = await run_db(lambda c: ops_snapshot())
    issues = []
    if snap["flagged_no_supplier_record"]:
        issues.append(f"{snap['flagged_no_supplier_record']} order(s) have no supplier record after 15 minutes. Decide: refund or mark delivered (Admin > Orders, status Needs review).")
    if snap["needs_review_over_limit"]:
        issues.append(f"{snap['needs_review_over_limit']} order(s) waiting over {OPS_STUCK_MINUTES} min for supplier confirmation.")
    if snap["processing_over_limit"]:
        issues.append(f"{snap['processing_over_limit']} order(s) still processing after {OPS_STUCK_MINUTES} min. Check the supplier order status.")
    if snap["topups_over_limit"]:
        issues.append(f"{snap['topups_over_limit']} top-up(s) pending over {OPS_TOPUP_STALE_HOURS} h. Verify the transfers (Admin > Top-ups).")
    if OPS["catalog_failures"] >= 3:
        issues.append("Catalogue sync keeps failing. Check SUPPLIER_API_KEY and the supplier status.")
    if SUPPLIER_API_KEY and SUPPLIER_LOW_BALANCE > 0:
        try:
            balance = float((await supplier_request("GET", "/account/balance")).get("balance") or 0)
            if balance < SUPPLIER_LOW_BALANCE:
                issues.append(f"Supplier balance is low: {balance:.2f}. Top it up before orders start failing.")
        except SupplierError as exc:
            issues.append(f"Supplier balance could not be checked ({exc.code}).")
    if issues:
        digest = "Operations check\n\n" + "\n".join(f"- {i}" for i in issues)
        await alert_admins("digest:" + str(hash(tuple(issues))), digest)
    return {"snapshot": snap, "issues": issues}

async def _ops_loop():
    while True:
        try:
            await ops_check()
        except Exception as exc:
            print(f"Operations check failed: {type(exc).__name__}: {exc}")
        await asyncio.sleep(600)

@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    """Never show internals to customers; alert admins with the ROUTE TEMPLATE (not the raw
    path, which can contain secrets or path-params that would flood distinct alert keys)."""
    route = request.scope.get("route")
    route_path = getattr(route, "path", None) or request.url.path
    logger.error("Unhandled error on %s %s: %s: %s", request.method, route_path, type(exc).__name__, exc)
    await alert_admins(f"500:{request.method}:{route_path}",
                       f"Unhandled error on {request.method} {route_path} ({type(exc).__name__}). Check the server logs.")
    return JSONResponse({"detail": "Something went wrong. Please try again."}, status_code=500)

@app.get("/api/admin/ops")
def admin_ops(u=Depends(admin)):
    return {
        **ops_snapshot(),
        "last_catalog_sync": OPS["last_catalog_sync"],
        "catalog_failures": OPS["catalog_failures"],
        "last_reconcile": OPS["last_reconcile"],
        "last_reconcile_report": OPS["last_reconcile_report"],
        "alerts_enabled": bool(BOT_TOKEN and ADMIN_IDS),
        "stuck_after_minutes": OPS_STUCK_MINUTES,
    }

@app.on_event("startup")
async def start_catalog_sync():
    _background_tasks.extend([
        asyncio.create_task(_catalog_loop(), name="flux-catalog-sync"),
        asyncio.create_task(_reconcile_loop(), name="flux-order-reconciliation"),
        asyncio.create_task(_ops_loop(), name="flux-operations-checks"),
    ])

# ── Admin: catalogue, pricing and settings ─────────────────────────────────
@app.get("/api/admin/catalog")
def admin_catalog(u=Depends(admin)):
    defaults = pricing_defaults()
    with db() as c:
        rows = c.execute("SELECT * FROM catalog WHERE removed=0 ORDER BY enabled DESC, name").fetchall()
    items = []
    for r in rows:
        cost = cost_cents_of(r["supplier_price"])
        sell = sell_cents(cost, r["margin_percent"], r["markup_cents"], defaults)
        items.append({"id": r["id"], "sid": f"sup-{r['id']}", "name": r["name"], "display_name": r["display_name"],
                      "category": r["category"], "period": r["period"], "tag": r["tag"],
                      "enabled": bool(r["enabled"]), "in_stock": bool(r["in_stock"]), "stock": r["stock"],
                      "supplier_price": float(r["supplier_price"]), "cost_cents": cost,
                      "margin_percent": r["margin_percent"], "markup_cents": r["markup_cents"],
                      "sell_cents": sell, "profit_cents": sell - cost, "synced_at": r["synced_at"],
                      "image_url": r["image_url"], "supplier_image": r["supplier_image"], "sticker": sticker_for(r["name"], r["category"]),
                      "featured": bool(r["featured"])})
    return {"defaults": {"margin_percent": defaults[0], "markup_cents": defaults[1]}, "items": items}

@app.post("/api/admin/catalog/{pid}")
def admin_update_catalog(pid: int, b: CatalogUpdate, u=Depends(admin)):
    sent = b.model_fields_set
    fields = {}
    if "enabled" in sent and b.enabled is not None: fields["enabled"] = 1 if b.enabled else 0
    if "margin_percent" in sent: fields["margin_percent"] = b.margin_percent   # null = use default
    if "markup_cents" in sent: fields["markup_cents"] = b.markup_cents         # null = use default
    if "category" in sent and b.category: fields["category"] = b.category.strip()
    if "period" in sent and b.period:
        if b.period not in PERIODS: raise HTTPException(400, "Period must be month, year or one-time")
        fields["period"] = b.period
    if "tag" in sent: fields["tag"] = (b.tag or "").strip() or None
    if "display_name" in sent: fields["display_name"] = (b.display_name or "").strip() or None
    if "image_url" in sent: fields["image_url"] = clean_https(b.image_url, "Image")   # null clears it
    if "featured" in sent and b.featured is not None: fields["featured"] = 1 if b.featured else 0
    if not fields: raise HTTPException(400, "Nothing to update")
    assignments = ", ".join(f"{k}=?" for k in fields)   # keys are fixed names above, never user input
    with db() as c:
        cur = c.execute(f"UPDATE catalog SET {assignments} WHERE id=?", (*fields.values(), pid))
        if cur.rowcount != 1: raise HTTPException(404, "Product not found")
    invalidate_public_products_cache()
    return {"id": pid, "updated": list(fields)}

@app.post("/api/admin/supplier/sync")
async def admin_sync_catalog(u=Depends(admin)):
    try:
        return await sync_catalog()
    except SupplierError as exc:
        raise HTTPException(502, f"Supplier sync failed ({exc.code})")

@app.post("/api/admin/orders/sync")
async def admin_sync_orders(u=Depends(admin)):
    return {"updated": await sync_supplier_orders()}

@app.get("/api/admin/settings")
async def admin_settings(u=Depends(admin)):
    supplier = {"configured": bool(SUPPLIER_API_KEY), "store": None, "ordering_enabled": None,
                "balance": None, "currency": None, "error": None}
    if SUPPLIER_API_KEY:
        try:
            info = await supplier_request("GET", "/account/info")
            bal = await supplier_request("GET", "/account/balance")
            supplier.update(store=info.get("store"), ordering_enabled=info.get("ordersEnabled"),
                            balance=float(bal.get("balance") or 0), currency=bal.get("currency"))
        except SupplierError as exc:
            supplier["error"] = f"Supplier check failed ({exc.code})"
    with db() as c:
        count = c.execute("SELECT COUNT(*) n FROM catalog WHERE removed=0").fetchone()["n"]
    return {"default_margin_percent": float(get_setting("default_margin_percent") or 0),
            "default_markup_cents": int(float(get_setting("default_markup_cents") or 0)),
            "bybit_address": get_setting("bybit_address"), "telegram_wallet_address": get_setting("telegram_wallet_address"),
            "catalog_synced_at": get_setting("catalog_synced_at") or None, "catalog_count": count, "supplier": supplier}

@app.post("/api/admin/settings")
def admin_update_settings(b: SettingsUpdate, u=Depends(admin)):
    for key in b.model_fields_set:
        val = getattr(b, key)
        if val is None: continue
        set_setting(key, val.strip() if isinstance(val, str) else val)
    invalidate_public_products_cache()
    return {"ok": True}

# ── Admin notifications and Telegram button handling for top-ups ───────────
async def notify_admins_topup(tid):
    if not BOT_TOKEN: return
    with db() as c:
        row = c.execute("SELECT t.*, u.first_name, u.username FROM topups t LEFT JOIN users u ON u.telegram_id=t.telegram_id WHERE t.id=?", (tid,)).fetchone()
    if not row or row["status"] != "pending": return
    handle = f"@{row['username']}" if row["username"] else "no username"
    text = (f"New top-up request {tid}\n\n"
            f"Customer: {row['first_name'] or 'Customer'} ({handle})\n"
            f"Telegram ID: {row['telegram_id']}\n"
            f"Credit amount: ${row['base_cents']/100:.2f}\n"
            f"Exact amount sent: {row['expected_millis']/1000:.3f} USDT\n"
            f"Method: {METHOD_LABELS.get(row['method'], row['method'])}\n"
            f"Payment reference: {row['reference']}\n"
            f"Customer's transfer reference: {row['tx_reference'] or 'none'}\n\n"
            "Check the exact amount arrived, then verify.")
    keyboard = {"inline_keyboard": [[{"text": "✅ Verify & credit", "callback_data": f"tp:ok:{tid}"},
                                     {"text": "❌ Reject", "callback_data": f"tp:no:{tid}"}]]}
    for admin_id in ADMIN_IDS:
        try:
            await telegram_api("sendMessage", {"chat_id": admin_id, "text": text, "reply_markup": keyboard})
        except Exception as exc:
            print(f"Could not notify admin {admin_id}: {type(exc).__name__}")

async def handle_callback(cb):
    cb_id = cb.get("id")
    sender = cb.get("from") or {}
    msg = cb.get("message") or {}
    if int(sender.get("id") or 0) not in ADMIN_IDS:
        await telegram_api("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Only store admins can do this.", "show_alert": True})
        return {"ok": True}
    if (cb.get("data") or "").startswith("sup:"):
        return await support_callback(cb, int(sender.get("id") or 0))
    parts = (cb.get("data") or "").split(":")
    if len(parts) != 3 or parts[0] != "tp" or parts[1] not in ("ok", "no"):
        await telegram_api("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Unknown action"})
        return {"ok": True}
    tid, decision = parts[2], ("approve" if parts[1] == "ok" else "reject")
    try:
        decide_topup_record(tid, decision)
    except HTTPException as exc:
        await telegram_api("answerCallbackQuery", {"callback_query_id": cb_id, "text": str(exc.detail), "show_alert": True})
        return {"ok": True}
    with db() as c:
        row = c.execute("SELECT telegram_id, base_cents FROM topups WHERE id=?", (tid,)).fetchone()
    try:
        if decision == "approve":
            await telegram_api("sendMessage", {"chat_id": row["telegram_id"], "text": f"Your top-up {tid} was confirmed. ${row['base_cents']/100:.2f} has been added to your wallet."})
        else:
            await telegram_api("sendMessage", {"chat_id": row["telegram_id"], "text": f"Your top-up {tid} could not be confirmed. Contact support with your payment reference."})
    except Exception:
        pass
    verdict = "✅ Verified and credited" if decision == "approve" else "❌ Rejected"
    by = sender.get("first_name") or "admin"
    try:
        await telegram_api("editMessageText", {"chat_id": msg["chat"]["id"], "message_id": msg["message_id"],
                                               "text": f"{msg.get('text', tid)}\n\n{verdict} by {by}", "reply_markup": {"inline_keyboard": []}})
    except Exception:
        pass
    await telegram_api("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Done"})
    return {"ok": True}

# ── Customer support: threads with replies through the bot ─────────────────
TICKET_RE = re.compile(r"TH-[A-F0-9]{8}")

class SupportMessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=1000)

def support_customer_info(telegram_id):
    with db() as c:
        row = c.execute("SELECT first_name, username FROM users WHERE telegram_id=?", (telegram_id,)).fetchone()
    return (row["first_name"], row["username"]) if row else ("Customer", None)

def support_open_thread(telegram_id):
    with db() as c:
        row = c.execute("SELECT id FROM support_threads WHERE telegram_id=? AND status='open' ORDER BY updated_at DESC LIMIT 1", (telegram_id,)).fetchone()
        if row:
            return row["id"]
        tid = "TH-" + secrets.token_hex(4).upper()
        now = datetime.now(timezone.utc).isoformat()
        c.execute("INSERT INTO support_threads(id,telegram_id,status,created_at,updated_at) VALUES(?,?,?,?,?)", (tid, telegram_id, "open", now, now))
    return tid

def support_add(thread_id, sender, body):
    now = datetime.now(timezone.utc).isoformat()
    with db() as c:
        c.execute("INSERT INTO support_messages(id,thread_id,sender,body,created_at) VALUES(?,?,?,?,?)",
                  ("SM-" + secrets.token_hex(5).upper(), thread_id, sender, body, now))
        c.execute("UPDATE support_threads SET updated_at=?, status='open' WHERE id=?", (now, thread_id))

async def support_notify_admins(thread_id, telegram_id, body):
    first, username = support_customer_info(telegram_id)
    handle = f"@{username}" if username else "no username"
    text = (f"Support message {thread_id}\n"
            f"From: {first} ({handle})\nTelegram ID: {telegram_id}\n\n{body}\n\n"
            "Tap Reply, or reply to this message, to answer.")
    keyboard = {"inline_keyboard": [[{"text": "↩️ Reply", "callback_data": f"sup:reply:{thread_id}"},
                                     {"text": "✅ Close", "callback_data": f"sup:close:{thread_id}"}]]}
    for admin_id in ADMIN_IDS:
        try:
            await telegram_api("sendMessage", {"chat_id": admin_id, "text": text, "reply_markup": keyboard})
        except Exception as exc:
            print(f"Could not notify admin {admin_id}: {type(exc).__name__}")

async def support_from_customer(telegram_id, first, username, body):
    tid = support_open_thread(telegram_id)
    support_add(tid, "customer", body)
    await support_notify_admins(tid, telegram_id, body)
    return tid

async def support_admin_reply(admin_id, tid, body):
    with db() as c:
        row = c.execute("SELECT telegram_id FROM support_threads WHERE id=?", (tid,)).fetchone()
    if not row:
        await telegram_api("sendMessage", {"chat_id": admin_id, "text": f"Ticket {tid} was not found."})
        return
    support_add(tid, "admin", body)
    try:
        await telegram_api("sendMessage", {"chat_id": row["telegram_id"], "text": f"Support reply:\n\n{body}\n\nYou can keep the conversation here or in the app."})
        await telegram_api("sendMessage", {"chat_id": admin_id, "text": f"Sent to the customer on {tid}."})
    except Exception:
        await telegram_api("sendMessage", {"chat_id": admin_id, "text": f"Saved on {tid}, but the customer could not be reached. They may have blocked the bot."})

async def support_close(tid, admin_id):
    with db() as c:
        row = c.execute("SELECT telegram_id FROM support_threads WHERE id=?", (tid,)).fetchone()
        if row:
            c.execute("UPDATE support_threads SET status='closed', updated_at=? WHERE id=?", (datetime.now(timezone.utc).isoformat(), tid))
    if not row:
        await telegram_api("sendMessage", {"chat_id": admin_id, "text": f"Ticket {tid} was not found."})
        return
    try:
        await telegram_api("sendMessage", {"chat_id": row["telegram_id"], "text": f"Your support request {tid} is closed. Send a message any time to open a new one."})
    except Exception:
        pass
    await telegram_api("sendMessage", {"chat_id": admin_id, "text": f"{tid} closed."})

async def support_callback(cb, admin_id):
    cb_id = cb.get("id")
    if admin_id not in ADMIN_IDS:
        await telegram_api("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Only store admins can do this.", "show_alert": True})
        return {"ok": True}
    _, action, tid = (cb.get("data") or "").split(":", 2)
    if action == "reply":
        set_setting(f"support_reply:{admin_id}", tid)
        await telegram_api("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Type your reply now"})
        await telegram_api("sendMessage", {"chat_id": admin_id, "text": f"Type your reply for {tid}. It goes straight to the customer. Send /cancel to stop."})
    elif action == "close":
        await support_close(tid, admin_id)
        await telegram_api("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Closed"})
    else:
        await telegram_api("answerCallbackQuery", {"callback_query_id": cb_id, "text": "Unknown action"})
    return {"ok": True}

@app.get("/api/support")
def support_get(u=Depends(current_user)):
    with db() as c:
        t = c.execute("SELECT id,status FROM support_threads WHERE telegram_id=? ORDER BY updated_at DESC LIMIT 1", (int(u["id"]),)).fetchone()
        msgs = c.execute("SELECT id,sender,body,created_at FROM support_messages WHERE thread_id=? ORDER BY created_at ASC LIMIT 200",
                         (t["id"],)).fetchall() if t else []
    return {"thread": dict(t) if t else None, "messages": [dict(m) for m in msgs]}

@app.post("/api/support/messages")
async def support_post(b: SupportMessageIn, u=Depends(current_user)):
    rate_limit(f"support:{u['id']}", 10)
    await run_db(lambda c: ensure_user_row(c, u))
    tg_id = int(u["id"])
    since = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    def _recent(c):
        return c.execute("SELECT COUNT(*) n FROM support_messages m JOIN support_threads t ON t.id=m.thread_id "
                         "WHERE t.telegram_id=? AND m.sender='customer' AND m.created_at>=?", (tg_id, since)).fetchone()["n"]
    recent = await run_db(_recent)
    if recent >= 10:
        raise HTTPException(429, "You're sending messages too quickly. Please wait a minute.")
    tid = await support_from_customer(tg_id, u.get("first_name"), u.get("username"), b.body.strip())
    return {"thread_id": tid, "status": "open"}

# ── Home feed: curated sections instead of one long list ───────────────────
@app.get("/api/feed")
def feed(response: Response):
    response.headers["Cache-Control"] = "public, max-age=5, stale-while-revalidate=15"
    now = datetime.now(timezone.utc)
    week = (now - timedelta(days=7)).isoformat()
    month = (now - timedelta(days=30)).isoformat()
    defaults = pricing_defaults()
    with db() as c:
        offers = c.execute("SELECT * FROM catalog WHERE enabled=1 AND removed=0 AND in_stock=1 AND featured=1 ORDER BY name LIMIT 8").fetchall()
        restocked = c.execute("SELECT * FROM catalog WHERE enabled=1 AND removed=0 AND in_stock=1 AND restocked_at>=? ORDER BY restocked_at DESC LIMIT 8", (week,)).fetchall()
        new = c.execute("SELECT * FROM catalog WHERE enabled=1 AND removed=0 AND in_stock=1 AND added_at>=? ORDER BY added_at DESC LIMIT 8", (week,)).fetchall()
        ranked = [r["sid"] for r in c.execute(
            "SELECT supplier_product_id sid, COUNT(*) n FROM orders WHERE status!='refunded' AND supplier_product_id IS NOT NULL "
            "AND created_at>=? GROUP BY supplier_product_id ORDER BY n DESC LIMIT 8", (month,)).fetchall()]
        popular_rows = c.execute(
            f"SELECT * FROM catalog WHERE enabled=1 AND removed=0 AND id IN ({','.join('?' * len(ranked))})",
            tuple(ranked)).fetchall() if ranked else []
    by_id = {r["id"]: r for r in popular_rows}
    popular = [by_id[i] for i in ranked if i in by_id]

    sections = [
        ("offers", "Best offers", "Hand-picked deals from our team", offers),
        ("restocked", "Just restocked", "Back in stock this week", restocked),
        ("new", "New arrivals", "Added in the last 7 days", new),
        ("popular", "Popular this month", "What other customers are buying", popular),
    ]
    return [{"key": key, "title": title, "subtitle": sub,
             "items": [catalog_public_item(r, defaults) for r in rows]}
            for key, title, sub, rows in sections if rows]

