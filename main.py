import os, json, hmac, hashlib, time, secrets, sqlite3
from urllib.parse import parse_qsl
from contextlib import contextmanager
from psycopg.rows import dict_row
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, HTTPException, Header, Depends, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
import httpx

ROOT = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL", "")
DB_PATH = os.getenv("DATABASE_PATH", os.path.join(ROOT, "flux.db"))
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
ADMIN_IDS = {int(x) for x in os.getenv("ADMIN_TELEGRAM_IDS", "").split(",") if x.strip().isdigit()}
TTL = int(os.getenv("PAYMENT_TTL_MINUTES", "20"))
WEBAPP_URL = os.getenv("FLUX_WEBAPP_URL", os.getenv("RENDER_EXTERNAL_URL", "")).rstrip("/")
WEBHOOK_SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET", secrets.token_urlsafe(32))
app = FastAPI(title="FLUX API", version="0.1.0")
app.mount("/static", StaticFiles(directory=os.path.join(ROOT, "static")), name="static")

PRODUCTS = [
 {"id":"spotify-premium","name":"Spotify Premium","category":"Music","description":"Sample listing; availability must be confirmed.","price":4.99,"icon":"♫","accent":"green","tag":"Popular"},
 {"id":"chatgpt-plus","name":"ChatGPT Plus","category":"AI tools","description":"Sample listing; availability must be confirmed.","price":19.99,"icon":"✳","accent":"mint","tag":"AI"},
 {"id":"netflix-premium","name":"Netflix Premium","category":"Entertainment","description":"Sample listing; regional availability may vary.","price":7.99,"icon":"N","accent":"red","tag":"Trending"},
 {"id":"adobe-creative","name":"Adobe Creative Cloud","category":"Design","description":"Sample listing; availability must be confirmed.","price":29.99,"icon":"✺","accent":"orange","tag":"Creative"},
 {"id":"gaming-points","name":"Gaming Points","category":"Gaming","description":"Sample listing; check region before ordering.","price":9.99,"icon":"◈","accent":"purple","tag":"Gaming"},
 {"id":"cloud-storage","name":"Cloud Storage","category":"Productivity","description":"Sample listing; availability must be confirmed.","price":5.99,"icon":"▤","accent":"blue","tag":"Utility"},
]

class DatabaseAdapter:
    """Small compatibility layer so existing parameterized queries work on SQLite and PostgreSQL."""
    def __init__(self, connection, postgres=False):
        self.connection = connection
        self.postgres = postgres

    def execute(self, query, params=()):
        if self.postgres:
            query = query.replace("?", "%s")
        return self.connection.execute(query, params)

    def executescript(self, script):
        if not self.postgres:
            return self.connection.executescript(script)
        for statement in script.split(";"):
            if statement.strip():
                self.execute(statement)

@contextmanager
def db():
    if DATABASE_URL:
        import psycopg
        conn = psycopg.connect(DATABASE_URL, row_factory=dict_row, connect_timeout=10)
        c = DatabaseAdapter(conn, postgres=True)
    else:
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

def init_db():
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS users(telegram_id INTEGER PRIMARY KEY,username TEXT,first_name TEXT,balance_cents INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS topups(id TEXT PRIMARY KEY,telegram_id INTEGER NOT NULL,method TEXT NOT NULL,base_cents INTEGER NOT NULL,expected_millis INTEGER NOT NULL,status TEXT NOT NULL,reference TEXT NOT NULL,expires_at TEXT NOT NULL,tx_reference TEXT,created_at TEXT NOT NULL,reviewed_at TEXT);
        CREATE UNIQUE INDEX IF NOT EXISTS unique_pending_amount ON topups(method,expected_millis) WHERE status='pending';
        CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY,telegram_id INTEGER NOT NULL,delta_cents INTEGER NOT NULL,reason TEXT NOT NULL,reference TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,telegram_id INTEGER NOT NULL,product_id TEXT NOT NULL,price_cents INTEGER NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,delivery_note TEXT);
        """)
        # Telegram IDs exceed PostgreSQL's signed 32-bit INTEGER range.
        # Convert existing production columns to BIGINT as an idempotent migration.
        if c.postgres:
            for table in ("users", "topups", "ledger", "orders"):
                c.execute(f"ALTER TABLE {table} ALTER COLUMN telegram_id TYPE BIGINT")
init_db()

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

def current_user(authorization: str|None=Header(default=None)):
    if os.getenv("FLUX_DEMO_MODE","false").lower()=="true": return {"id":100000001,"username":"demo_user","first_name":"Demo"}
    if not authorization or not authorization.startswith("tma "): raise HTTPException(401,"Open FLUX inside Telegram to continue")
    return validate_init(authorization[4:])

def ensure_user(u):
    with db() as c:
        c.execute("INSERT INTO users(telegram_id,username,first_name,created_at) VALUES(?,?,?,?) ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username,first_name=excluded.first_name",(u["id"],u.get("username",""),u.get("first_name","Customer"),datetime.now(timezone.utc).isoformat()))

def admin(u=Depends(current_user)):
    if u["id"] not in ADMIN_IDS: raise HTTPException(403,"Admin access required")
    return u

async def telegram_api(method, payload):
    if not BOT_TOKEN:
        return None
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(f"https://api.telegram.org/bot{BOT_TOKEN}/{method}", json=payload)
        response.raise_for_status()
        result = response.json()
        if not result.get("ok"):
            raise RuntimeError("Telegram API request failed")
        return result.get("result")

@app.on_event("startup")
async def configure_telegram_webhook():
    # Render exposes RENDER_EXTERNAL_URL automatically. Setting a webhook enables /start replies.
    if BOT_TOKEN and WEBAPP_URL.startswith("https://"):
        try:
            await telegram_api("setMyCommands", {"commands": [
                {"command": "start", "description": "Open the FLUX store"},
                {"command": "balance", "description": "Check your wallet balance"},
                {"command": "orders", "description": "View your recent orders"},
                {"command": "help", "description": "Get help and safety guidance"}
            ]})
            await telegram_api("setWebhook", {
                "url": WEBAPP_URL + "/telegram/webhook/" + WEBHOOK_SECRET,
                "secret_token": WEBHOOK_SECRET,
                "allowed_updates": ["message"]
            })
        except Exception as exc:
            print(f"Telegram webhook setup failed: {type(exc).__name__}: {exc}")

@app.post("/telegram/webhook/{secret}")
async def telegram_webhook(secret: str, update: dict, request: Request):
    header_secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if not hmac.compare_digest(secret, WEBHOOK_SECRET) or not hmac.compare_digest(header_secret, WEBHOOK_SECRET):
        raise HTTPException(403, "Forbidden")
    message = update.get("message") or {}
    chat = message.get("chat") or {}
    user = message.get("from") or {}
    text_in = (message.get("text") or "").strip()
    if not chat.get("id") or not text_in:
        return {"ok": True}
    command = text_in.split()[0].split("@")[0].lower()
    telegram_id = user.get("id")
    first = user.get("first_name") or "there"
    if telegram_id:
        ensure_user({"id": int(telegram_id), "username": user.get("username", ""), "first_name": first})
    keyboard = {"inline_keyboard": [[{"text": "Open FLUX", "web_app": {"url": WEBAPP_URL}}]]} if WEBAPP_URL.startswith("https://") else None

    async def reply(message_text, markup=None):
        payload = {"chat_id": chat["id"], "text": message_text}
        if markup:
            payload["reply_markup"] = markup
        await telegram_api("sendMessage", payload)

    if command == "/start":
        welcome = f"Welcome to FLUX, {first}!\n\nYour digital essentials in one place. Browse products, manage wallet requests, and track orders."
        if not keyboard:
            welcome += "\n\nThe app link is being configured. Please try again shortly."
        await reply(welcome, keyboard)
    elif command in ("/help", "/commands"):
        await reply("FLUX commands\n/start — open the store\n/balance — view wallet balance\n/orders — recent orders\n/help — this message\n\nPayments are manually reviewed. Never send funds until official recipient instructions are configured.")
    elif command == "/balance":
        with db() as c:
            row = c.execute("SELECT balance_cents FROM users WHERE telegram_id=?", (int(telegram_id),)).fetchone()
        await reply("Your FLUX wallet balance: USD " + format((row["balance_cents"] if row else 0) / 100, ".2f"))
    elif command == "/orders":
        with db() as c:
            rows = c.execute("SELECT id,product_id,status,created_at FROM orders WHERE telegram_id=? ORDER BY created_at DESC LIMIT 5", (int(telegram_id),)).fetchall()
        if not rows:
            await reply("You do not have any FLUX orders yet.")
        else:
            lines = ["Your latest FLUX orders:"]
            for row in rows:
                lines.append(f"• {row['id']} — {row['product_id'].replace('-', ' ')} ({row['status'].replace('_', ' ')})")
            await reply("\n".join(lines), keyboard)
    elif command in ("/admin", "/pending", "/stats") and telegram_id in ADMIN_IDS:
        if command == "/stats":
            with db() as c:
                users_n = c.execute("SELECT COUNT(*) n FROM users").fetchone()["n"]
                orders_n = c.execute("SELECT COUNT(*) n FROM orders").fetchone()["n"]
                pending_n = c.execute("SELECT COUNT(*) n FROM topups WHERE status='pending'").fetchone()["n"]
                balance_n = c.execute("SELECT COALESCE(SUM(balance_cents),0) n FROM users").fetchone()["n"]
            await reply(f"FLUX admin overview\nUsers: {users_n}\nOrders: {orders_n}\nPending top-ups: {pending_n}\nTotal wallet liabilities: USD {balance_n/100:.2f}")
        else:
            with db() as c:
                rows = c.execute("SELECT id,telegram_id,method,base_cents,tx_reference FROM topups WHERE status='pending' ORDER BY created_at ASC LIMIT 15").fetchall()
            if not rows:
                await reply("No pending top-ups right now.")
            else:
                lines = ["Pending top-ups (verify funds before approving):"]
                for row in rows:
                    lines.append(f"{row['id']} · user {row['telegram_id']} · USD {row['base_cents']/100:.2f} · {row['method']} · ref: {row['tx_reference'] or 'not submitted'}")
                lines.append("Approve: /approve TP-XXXXXXXX\nReject: /reject TP-XXXXXXXX")
                await reply("\n".join(lines))
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
                        await telegram_api("sendMessage", {"chat_id": row["telegram_id"], "text": f"Your FLUX top-up {result['id']} has been approved. Wallet credit: USD {row['base_cents']/100:.2f}."})
                    except Exception:
                        pass
            except HTTPException as exc:
                await reply(f"Could not process top-up: {exc.detail}")
    elif command.startswith("/"):
        await reply("I did not recognize that command. Use /help for the command list.")
    return {"ok": True}

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

@app.get("/") 
def home(): return FileResponse(os.path.join(ROOT,"static","index.html"))
@app.get("/health")
def health(): return {"status":"ok","service":"flux-api"}
@app.get("/api/config")
def config(): return {"brand":"FLUX","demo_mode":os.getenv("FLUX_DEMO_MODE","false").lower()=="true","payment_ttl_minutes":TTL,"currency":"USD"}
@app.get("/api/products")
def products(category:str|None=None,q:str|None=None):
    items=PRODUCTS
    if category and category.lower() not in ("all","popular"): items=[p for p in items if p["category"].lower()==category.lower()]
    if category and category.lower()=="popular": items=[p for p in items if p.get("tag") in ("Popular","Trending")]
    if q: items=[p for p in items if q.lower() in (p["name"]+p["category"]+p["description"]).lower()]
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
    ensure_user(u); method=b.method.lower().strip()
    if method not in ("bybit","telegram_wallet"): raise HTTPException(400,"Choose Bybit or Telegram Wallet")
    if abs(b.amount-round(b.amount))>1e-9: raise HTTPException(400,"Custom top-ups must be whole-dollar amounts")
    cents=round(b.amount*100)
    with db() as c:
        c.execute("UPDATE topups SET status='expired' WHERE status='pending' AND expires_at<=?", (datetime.now(timezone.utc).isoformat(),))
        for _ in range(100):
            expected=cents*10+secrets.randbelow(999)+1
            if not c.execute("SELECT 1 FROM topups WHERE method=? AND expected_millis=? AND status='pending'",(method,expected)).fetchone(): break
        else: raise HTTPException(503,"Could not reserve a unique amount; retry")
        tid="TP-"+secrets.token_hex(4).upper(); ref="FLX-"+secrets.token_hex(3).upper()
        now=datetime.now(timezone.utc); expiry=now+timedelta(minutes=TTL)
        c.execute("INSERT INTO topups(id,telegram_id,method,base_cents,expected_millis,status,reference,expires_at,created_at) VALUES(?,?,?,?,?,'pending',?,?,?)",(tid,u["id"],method,cents,expected,ref,expiry.isoformat(),now.isoformat()))
    return {"id":tid,"method":method,"base_amount":cents/100,"expected_amount":expected/1000,"reference":ref,"expires_at":expiry.isoformat(),"expires_in_seconds":TTL*60,"instructions":"Only send funds after the store owner has configured and verified recipient details."}
@app.post("/api/topups/{tid}/verify")
def verify(tid:str,b:VerifyRequest,u=Depends(current_user)):
    with db() as c:
        row=c.execute("SELECT * FROM topups WHERE id=? AND telegram_id=?",(tid,u["id"])).fetchone()
        if not row: raise HTTPException(404,"Top-up not found")
        if row["status"]!="pending": raise HTTPException(400,"This top-up is no longer pending")
        if row["expires_at"] <= datetime.now(timezone.utc).isoformat():
            c.execute("UPDATE topups SET status='expired' WHERE id=? AND status='pending'", (tid,))
            return {"status":"expired","message":"This payment request expired. Create a new request."}
        c.execute("UPDATE topups SET tx_reference=? WHERE id=?",(b.tx_reference.strip(),tid))
    return {"status":"pending","message":"Submitted for manual review. Wallet is credited only after an administrator confirms funds arrived."}
@app.get("/api/orders")
def orders(u=Depends(current_user)):
    with db() as c: rows=c.execute("SELECT id,product_id,price_cents,status,created_at,delivery_note FROM orders WHERE telegram_id=? ORDER BY created_at DESC LIMIT 50",(u["id"],)).fetchall()
    return [dict(r,price=r["price_cents"]/100) for r in rows]
@app.post("/api/orders")
def create_order(b:OrderCreate,u=Depends(current_user)):
    ensure_user(u); p=next((p for p in PRODUCTS if p["id"]==b.product_id),None)
    if not p: raise HTTPException(404,"Product not found")
    cents=round(p["price"]*100); oid="OR-"+secrets.token_hex(4).upper()
    with db() as c:
        row=c.execute("SELECT balance_cents FROM users WHERE telegram_id=?",(u["id"],)).fetchone()
        if row["balance_cents"]<cents: raise HTTPException(400,"Insufficient balance. Add funds first.")
        updated = c.execute("UPDATE users SET balance_cents=balance_cents-? WHERE telegram_id=? AND balance_cents>=?",(cents,u["id"],cents))
        if updated.rowcount != 1: raise HTTPException(400,"Insufficient balance. Add funds first.")
        c.execute("INSERT INTO orders(id,telegram_id,product_id,price_cents,status,created_at) VALUES(?,?,?,?,?,?)",(oid,u["id"],p["id"],cents,"pending_review",datetime.now(timezone.utc).isoformat()))
        c.execute("INSERT INTO ledger(id,telegram_id,delta_cents,reason,reference,created_at) VALUES(?,?,?,?,?,?)",("LG-"+secrets.token_hex(5),u["id"],-cents,"order",oid,datetime.now(timezone.utc).isoformat()))
    return {"id":oid,"status":"pending_review","message":"Order recorded; supplier fulfillment is not configured yet."}
@app.get("/api/admin/topups")
def admin_topups(u=Depends(admin)):
    with db() as c: rows=c.execute("SELECT * FROM topups ORDER BY created_at DESC LIMIT 100").fetchall()
    return [dict(r) for r in rows]
@app.post("/api/admin/topups/{tid}")
def decide_topup(tid: str, b: AdminDecision, u=Depends(admin)):
    return decide_topup_record(tid, b.decision, b.note)
