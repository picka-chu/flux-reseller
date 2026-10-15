"""Operations: alerts reach admins, repeats are rate-limited, admin health is admin-only, and
customers never see internal errors."""
import asyncio
from datetime import timedelta

import main


def test_alert_is_sent_once_per_cooldown(monkeypatch):
    sent = []

    async def fake_api(method, payload):
        sent.append(payload)

    monkeypatch.setattr(main, "telegram_api", fake_api)
    monkeypatch.setattr(main, "ADMIN_IDS", {100000001})
    main._last_alert_at.clear()

    assert asyncio.run(main.alert_admins("k", "first")) is True
    assert asyncio.run(main.alert_admins("k", "again")) is False
    assert len(sent) == 1 and sent[0]["chat_id"] == 100000001
    assert sent[0]["text"].startswith("FLUX alert")


def test_alert_fires_again_after_cooldown(monkeypatch):
    sent = []

    async def fake_api(method, payload):
        sent.append(payload)

    monkeypatch.setattr(main, "telegram_api", fake_api)
    monkeypatch.setattr(main, "ADMIN_IDS", {100000001})
    main._last_alert_at.clear()
    asyncio.run(main.alert_admins("k", "first"))
    main._last_alert_at["k"] -= main.OPS_ALERT_COOLDOWN + timedelta(minutes=1)
    assert asyncio.run(main.alert_admins("k", "later")) is True
    assert len(sent) == 2


def test_snapshot_counts_orders_that_need_a_human(user_balance, backdate, client, supplier):
    with main.db() as d:
        d.execute("INSERT INTO orders(id,telegram_id,product_id,price_cents,status,created_at,review_note) "
                  "VALUES('OR-A',100000001,'x',100,'needs_review','2026-01-01T00:00:00+00:00','no record')")
        d.execute("INSERT INTO orders(id,telegram_id,product_id,price_cents,status,created_at) "
                  "VALUES('OR-B',100000001,'x',100,'needs_review','2026-01-01T00:00:00+00:00')")
    snap = main.ops_snapshot()
    assert snap["needs_review"] == 2
    assert snap["flagged_no_supplier_record"] == 1
    assert snap["needs_review_over_limit"] == 2       # created in 2026, far older than the limit


def test_digest_only_when_something_needs_attention(monkeypatch, client, supplier):
    sent = []

    async def fake_api(method, payload):
        sent.append(payload)

    monkeypatch.setattr(main, "telegram_api", fake_api)
    monkeypatch.setattr(main, "ADMIN_IDS", {100000001})
    monkeypatch.setattr(main, "SUPPLIER_LOW_BALANCE", 0)
    main._last_alert_at.clear()
    with main.db() as d:
        d.execute("DELETE FROM orders")
    result = asyncio.run(main.ops_check())
    assert result["issues"] == [] and sent == []


def test_low_supplier_balance_raises_an_issue(monkeypatch, client, supplier):
    sent = []

    async def fake_api(method, payload):
        sent.append(payload)

    monkeypatch.setattr(main, "telegram_api", fake_api)
    monkeypatch.setattr(main, "ADMIN_IDS", {100000001})
    monkeypatch.setattr(main, "SUPPLIER_LOW_BALANCE", 50.0)
    supplier.balance = "12.00"
    main._last_alert_at.clear()
    result = asyncio.run(main.ops_check())
    assert any("Supplier balance is low" in i for i in result["issues"])
    assert sent and "Operations check" in sent[0]["text"]


def test_admin_ops_endpoint_is_admin_only(client):
    assert client.get("/api/admin/ops").status_code == 200   # demo user 100000001 is an admin in tests
    main.ADMIN_IDS.discard(100000001)
    try:
        assert client.get("/api/admin/ops").status_code == 403
    finally:
        main.ADMIN_IDS.add(100000001)


def test_unhandled_error_returns_safe_message(monkeypatch, client):
    monkeypatch.setattr(main, "ADMIN_IDS", {100000001})
    monkeypatch.setattr(main, "telegram_api", lambda *a, **k: asyncio.sleep(0))
    monkeypatch.setattr(main, "ops_snapshot", lambda: (_ for _ in ()).throw(RuntimeError("secret internals")))
    from fastapi.testclient import TestClient
    tc = TestClient(main.app, raise_server_exceptions=False)
    r = tc.get("/api/admin/ops")
    assert r.status_code == 500
    assert r.json() == {"detail": "Something went wrong. Please try again."}
    assert "secret" not in r.text
