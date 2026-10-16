"""Auth, webhook, top-up and pricing tests — the critical paths that were previously untested.

These run against the same fake supplier + SQLite setup as the rest of the suite, but exercise
real Telegram initData signatures (with a fake bot token) instead of demo mode.
"""
import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import pytest

import main
from conftest import PRODUCT_ID, ADMIN_ID


def make_init_data(bot_token: str, user_id: int, username="tester", auth_date=None, tamper=False):
    """Build a valid Telegram Mini App initData string, optionally tampered."""
    if auth_date is None:
        auth_date = int(time.time())
    data = {
        "auth_date": str(auth_date),
        "query_id": "AAF_test",
        "user": json.dumps({"id": user_id, "username": username, "first_name": "T"}),
    }
    pairs = sorted(data.items())
    check_string = "\n".join(f"{k}={v}" for k, v in pairs)
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    signature = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    if tamper:
        data["user"] = json.dumps({"id": user_id + 1, "username": username, "first_name": "T"})
    return urlencode({**data, "hash": signature})


@pytest.fixture
def auth_env(monkeypatch):
    """Turn off demo mode and set a fake bot token so initData validation actually runs."""
    monkeypatch.setattr(main, "DEMO_MODE", False)
    monkeypatch.setattr(main, "DEMO_ALLOWED", False)
    monkeypatch.setattr(main, "BOT_TOKEN", "123456:TEST_FAKE_TOKEN_FOR_SIGNATURES_ONLY")


def auth_header(bot_token, user_id=555, **kw):
    return {"Authorization": "tma " + make_init_data(bot_token, user_id, **kw)}


# ── initData validation ──────────────────────────────────────────────────────

def test_me_requires_auth_header(client, auth_env):
    r = client.get("/api/me")
    assert r.status_code == 401


def test_me_rejects_missing_hash(client, auth_env):
    r = client.get("/api/me", headers={"Authorization": "tma auth_date=1&user=%7B%22id%22%3A1%7D"})
    assert r.status_code == 401


def test_me_rejects_forged_signature(client, auth_env):
    good = make_init_data(main.BOT_TOKEN, 555)
    forged = good[:-4] + "0000"  # flip the tail of the hash
    r = client.get("/api/me", headers={"Authorization": "tma " + forged})
    assert r.status_code == 401


def test_me_rejects_tampered_user_but_same_hash(client, auth_env):
    raw = make_init_data(main.BOT_TOKEN, 555, tamper=True)
    r = client.get("/api/me", headers={"Authorization": "tma " + raw})
    assert r.status_code == 401


def test_me_rejects_expired_auth_date(client, auth_env):
    stale = make_init_data(main.BOT_TOKEN, 555, auth_date=int(time.time()) - 90_000)
    r = client.get("/api/me", headers={"Authorization": "tma " + stale})
    assert r.status_code == 401
    assert "expired" in r.json()["detail"].lower()


def test_me_accepts_valid_signature(client, auth_env):
    r = client.get("/api/me", headers=auth_header(main.BOT_TOKEN, 555))
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == 555
    assert body["balance"] == 0


def test_admin_returns_403_for_non_admin(client, auth_env):
    r = client.get("/api/admin/overview", headers=auth_header(main.BOT_TOKEN, 999))
    assert r.status_code == 403


def test_admin_returns_200_for_admin(client, auth_env):
    r = client.get("/api/admin/overview", headers=auth_header(main.BOT_TOKEN, ADMIN_ID))
    assert r.status_code == 200


def test_protected_mutations_require_auth(client, auth_env):
    for method, path in [("POST", "/api/orders"), ("POST", "/api/topups"), ("POST", "/api/support/messages")]:
        r = getattr(client, method.lower())(path, json={"product_id": "sup-1", "amount": 5, "method": "bybit", "body": "hi"})
        assert r.status_code == 401, path


# ── Demo-mode fail-closed in production ──────────────────────────────────────

def test_demo_mode_is_rejected_when_production_signal_present(monkeypatch, client):
    monkeypatch.setattr(main, "DEMO_MODE", True)
    monkeypatch.setattr(main, "DEMO_ALLOWED", False)
    r = client.get("/api/me")
    assert r.status_code == 500
    assert "demo mode" in r.json()["detail"].lower()


def test_validate_production_config_rejects_demo_mode(monkeypatch):
    monkeypatch.setattr(main, "DEMO_MODE", True)
    monkeypatch.setattr(main, "BOT_TOKEN", "t")
    monkeypatch.setattr(main, "WEBHOOK_SECRET", "s" * 32)
    monkeypatch.setattr(main, "ADMIN_IDS", {1})
    monkeypatch.setattr(main, "DATABASE_URL", "postgres://x")
    monkeypatch.setattr(main, "WEBAPP_URL", "https://x")
    monkeypatch.setattr(main, "SUPPLIER_API_KEY", "k")
    with pytest.raises(RuntimeError, match="FLUX_DEMO_MODE"):
        main.validate_production_config()


# ── Webhook secret is header-only, path is not a credential ──────────────────

def test_webhook_rejects_missing_secret_header(client, auth_env):
    r = client.post("/telegram/webhook", json={"update_id": 1})
    assert r.status_code == 403


def test_webhook_rejects_wrong_secret_header(client, auth_env):
    r = client.post("/telegram/webhook", json={"update_id": 1},
                    headers={"X-Telegram-Bot-Api-Secret-Token": "wrong"})
    assert r.status_code == 403


def test_webhook_accepts_correct_secret_header(client, auth_env, monkeypatch):
    monkeypatch.setattr(main, "WEBHOOK_SECRET", "correct-secret")
    r = client.post("/telegram/webhook", json={"update_id": 1},
                    headers={"X-Telegram-Bot-Api-Secret-Token": "correct-secret"})
    assert r.status_code == 200


def test_webhook_secret_not_in_url_route(client):
    paths = [getattr(r, "path", "") for r in client.app.routes]
    assert "/telegram/webhook/{secret}" not in paths
    assert "/telegram/webhook" in paths


# ── Top-up money path ────────────────────────────────────────────────────────

def _set_payment_address(method="bybit", address="TXyz123"):
    main.set_setting(f"{method}_address", address)


def test_topup_create_requires_recipient(client):
    r = client.post("/api/topups", json={"amount": 10, "method": "bybit"})
    assert r.status_code == 503


def test_topup_create_rejects_fractional_amount(client, monkeypatch):
    _set_payment_address()
    r = client.post("/api/topups", json={"amount": 10.5, "method": "bybit"})
    assert r.status_code == 400


def test_topup_create_and_approve_credits_wallet(client, monkeypatch, balance):
    _set_payment_address()
    r = client.post("/api/topups", json={"amount": 10, "method": "bybit"})
    assert r.status_code == 200
    tid = r.json()["id"]

    # Approve via admin endpoint
    r2 = client.post(f"/api/admin/topups/{tid}", json={"decision": "approve", "note": "verified"})
    assert r2.status_code == 200
    assert r2.json()["status"] == "approved"
    assert balance() == 1000  # $10.00


def test_topup_double_approve_is_refused(client, monkeypatch, balance):
    _set_payment_address()
    tid = client.post("/api/topups", json={"amount": 10, "method": "bybit"}).json()["id"]
    assert client.post(f"/api/admin/topups/{tid}", json={"decision": "approve"}).status_code == 200
    assert client.post(f"/api/admin/topups/{tid}", json={"decision": "approve"}).status_code == 409
    assert balance() == 1000  # credited exactly once


def test_topup_reject_does_not_credit(client, monkeypatch, balance):
    _set_payment_address()
    tid = client.post("/api/topups", json={"amount": 10, "method": "bybit"}).json()["id"]
    r = client.post(f"/api/admin/topups/{tid}", json={"decision": "reject", "note": "no funds"})
    assert r.status_code == 200
    assert balance() == 0


def test_topup_pending_cap_blocks_flood(client, monkeypatch):
    _set_payment_address()
    for _ in range(5):
        assert client.post("/api/topups", json={"amount": 10, "method": "bybit"}).status_code == 200
    r = client.post("/api/topups", json={"amount": 10, "method": "bybit"})
    assert r.status_code == 429


def test_topup_verify_rate_limited(client, monkeypatch):
    _set_payment_address()
    tid = client.post("/api/topups", json={"amount": 10, "method": "bybit"}).json()["id"]
    main._rate_buckets.clear()
    statuses = []
    for i in range(8):
        r = client.post(f"/api/topups/{tid}/verify", json={"tx_reference": f"REF{i}"})
        statuses.append(r.status_code)
    assert 429 in statuses  # after 6 in a minute, further calls are rejected


def test_topup_verify_is_idempotent_per_reference(client, monkeypatch):
    """Repeated verify with the same reference should not notify admins again."""
    _set_payment_address()
    tid = client.post("/api/topups", json={"amount": 10, "method": "bybit"}).json()["id"]
    main._topup_last_notify.clear()
    calls = []
    async def fake_notify(t):
        calls.append(t)
    orig = main.notify_admins_topup
    main.notify_admins_topup = fake_notify
    try:
        for _ in range(4):
            client.post(f"/api/topups/{tid}/verify", json={"tx_reference": "SAME"})
    finally:
        main.notify_admins_topup = orig
    assert len(calls) == 1  # de-duplicated


# ── Pricing math ─────────────────────────────────────────────────────────────

def test_cost_cents_ceils():
    assert main.cost_cents_of("4.001") == 401
    assert main.cost_cents_of("4.00") == 400
    assert main.cost_cents_of("0.01") == 1


def test_sell_cents_applies_margin_and_markup_with_ceiling():
    # 1000 cents * 1.20 + 50 = 1250
    assert main.sell_cents(1000, 20, 50, defaults=(0, 0)) == 1250
    # Ceiling rounding: 1000 * 1.125 = 1125 exactly
    assert main.sell_cents(1000, 12.5, 0, defaults=(0, 0)) == 1125
    # Non-integer intermediate rounds up: 999 * 1.10 = 1098.9 -> 1099
    assert main.sell_cents(999, 10, 0, defaults=(0, 0)) == 1099


def test_sell_cents_uses_defaults_when_margin_is_null():
    assert main.sell_cents(1000, None, None, defaults=(50, 0)) == 1500
    assert main.sell_cents(1000, None, None, defaults=(0, 250)) == 1250


def test_order_price_is_server_computed_not_client_supplied(client, monkeypatch, supplier):
    """The client sends only product_id + idempotency_key; the price comes from the server."""
    _set_payment_address()
    tid = client.post("/api/topups", json={"amount": 50, "method": "bybit"}).json()["id"]
    client.post(f"/api/admin/topups/{tid}", json={"decision": "approve"})
    r = client.post("/api/orders", json={
        "product_id": f"sup-{PRODUCT_ID}",
        "idempotency_key": "a" * 20,
        "price": 0.01,  # tampered field the server must ignore
    })
    assert r.status_code == 200
    # Fake supplier price is 4.00, default margin 20% -> sell = 4.80
    with main.db() as c:
        row = c.execute("SELECT price_cents FROM orders WHERE id=?", (r.json()["id"],)).fetchone()
    assert row["price_cents"] == 480


# ── Orphaned processing window ───────────────────────────────────────────────

def test_order_without_supplier_code_is_parked_for_review(client, monkeypatch, supplier, balance):
    _set_payment_address()
    tid = client.post("/api/topups", json={"amount": 50, "method": "bybit"}).json()["id"]
    client.post(f"/api/admin/topups/{tid}", json={"decision": "approve"})
    start_balance = balance()

    async def no_code(method, path, json_body=None):
        if method == "POST" and path == "/orders":
            return {"ok": True, "order": {"status": "completed", "value": "x"}}  # no orderCode
        return await supplier(method, path, json_body)
    monkeypatch.setattr(main, "supplier_request", no_code)

    r = client.post("/api/orders", json={"product_id": f"sup-{PRODUCT_ID}", "idempotency_key": "b" * 20})
    assert r.status_code == 200
    assert r.json()["status"] == "needs_review"
    # Money is debited but the order is parked, not silently stuck in 'processing'
    with main.db() as c:
        row = c.execute("SELECT status, supplier_order_code FROM orders WHERE id=?", (r.json()["id"],)).fetchone()
    assert row["status"] == "needs_review"
    assert row["supplier_order_code"] is None
    assert balance() == start_balance - 480


def test_reconcile_includes_processing_without_supplier_code(client, monkeypatch, supplier, balance):
    _set_payment_address()
    tid = client.post("/api/topups", json={"amount": 50, "method": "bybit"}).json()["id"]
    client.post(f"/api/admin/topups/{tid}", json={"decision": "approve"})

    async def no_code(method, path, json_body=None):
        if method == "POST" and path == "/orders":
            supplier._record("completed")  # supplier DID create it, just didn't tell us the code
            return {"ok": True, "order": {"status": "completed", "value": "x"}}
        return await supplier(method, path, json_body)
    monkeypatch.setattr(main, "supplier_request", no_code)

    r = client.post("/api/orders", json={"product_id": f"sup-{PRODUCT_ID}", "idempotency_key": "c" * 20})
    oid = r.json()["id"]
    assert r.json()["status"] == "needs_review"

    # Restore normal supplier and reconcile: should adopt the supplier's order
    monkeypatch.setattr(main, "supplier_request", supplier)
    report = __import__("asyncio").run(main.reconcile_unclear_orders())
    with main.db() as c:
        row = c.execute("SELECT status, supplier_order_code FROM orders WHERE id=?", (oid,)).fetchone()
    assert row["status"] == "processing"
    assert row["supplier_order_code"] is not None
