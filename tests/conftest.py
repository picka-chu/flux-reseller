"""Shared test setup. Every test runs against a temporary SQLite database and an in-process fake
supplier, so the suite needs no network, no Telegram token and no real supplier key."""
import os
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

_tmp = tempfile.mkdtemp(prefix="flux-test-")
os.environ.update({
    "FLUX_DEMO_MODE": "true",
    "ADMIN_TELEGRAM_IDS": "100000001",
    "DATABASE_PATH": os.path.join(_tmp, "test.db"),
    "SUPPLIER_API_KEY": "test-key",
    "SUPPLIER_API_BASE": "http://supplier.invalid/api/reseller/v1",
    "TELEGRAM_BOT_TOKEN": "",          # no real Telegram calls from tests
})

import main  # noqa: E402  (import after environment is set)
from fastapi.testclient import TestClient  # noqa: E402

PRODUCT_ID = 101
ADMIN_ID = 100000001


class FakeSupplier:
    """Stands in for the reseller API. `mode` decides how the next purchase answers."""

    def __init__(self):
        self.orders = []          # what the supplier's order list shows
        self.mode = "ok"
        self.balance = "100.00"
        self.counter = 0

    def _record(self, status):
        self.counter += 1
        rec = {"orderCode": f"rs_{self.counter:04d}", "productId": PRODUCT_ID, "quantity": 1, "status": status,
               "total": "4.00", "error": None, "value": "DELIVERED_DIGITAL_PRODUCT",
               "createdAt": main.datetime.now(main.timezone.utc).isoformat()}
        self.orders.append(rec)
        return rec

    async def __call__(self, method, path, json_body=None):
        if method == "GET" and path == "/products":
            return {"ok": True, "products": [{"productId": PRODUCT_ID, "name": "Spotify Premium", "description": "Music",
                                             "price": "4.00", "currency": "USD", "stock": 5, "inStock": True}]}
        if method == "GET" and path.startswith("/products/"):
            return {"ok": True, "product": {"productId": PRODUCT_ID, "name": "Spotify Premium", "price": "4.00",
                                            "stock": 5, "inStock": True}}
        if method == "GET" and path == "/orders":
            return {"ok": True, "orders": list(self.orders)}
        if method == "GET" and path.startswith("/orders/"):
            code = path.rsplit("/", 1)[1]
            found = next((o for o in self.orders if o["orderCode"] == code), None)
            if not found:
                raise main.SupplierError(404, "order_not_found")
            return {"ok": True, "order": found}
        if method == "GET" and path == "/account/balance":
            return {"ok": True, "balance": self.balance, "currency": "USD"}
        if method == "POST" and path == "/orders":
            m = self.mode
            if m == "ok":
                return {"ok": True, "order": self._record("completed")}
            if m == "ghost":        # charged, but the response was an error
                self._record("completed")
                raise main.SupplierError(500, "internal")
            if m == "pending":
                self._record("processing")
                raise main.SupplierError(409, "supplier_purchase_pending")
            if m == "failed":
                raise main.SupplierError(400, "supplier_purchase_failed")
            if m == "unmatched":    # no record at all
                raise main.SupplierError(500, "internal")
            if m == "insufficient":
                raise main.SupplierError(402, "insufficient_funds")
        raise main.SupplierError(404, "not_found")


@pytest.fixture
def supplier(monkeypatch):
    fake = FakeSupplier()
    monkeypatch.setattr(main, "supplier_request", fake)
    return fake


@pytest.fixture
def client(supplier):
    # No `with` block: startup background loops stay off, so every step is deterministic.
    import asyncio
    asyncio.run(main.sync_catalog())
    return TestClient(main.app)


@pytest.fixture
def user_balance():
    def fund(cents):
        with main.db() as d:
            d.execute("INSERT INTO users(telegram_id,username,first_name,balance_cents,created_at) "
                      "VALUES(?,?,?,?,?) ON CONFLICT(telegram_id) DO UPDATE SET balance_cents=excluded.balance_cents",
                      (ADMIN_ID, "demo", "Demo", cents, "2026-01-01T00:00:00+00:00"))
    return fund


@pytest.fixture
def balance():
    def read():
        with main.db() as d:
            return d.execute("SELECT balance_cents FROM users WHERE telegram_id=?", (ADMIN_ID,)).fetchone()["balance_cents"]
    return read


@pytest.fixture
def order_row():
    def read(oid):
        with main.db() as d:
            return dict(d.execute("SELECT * FROM orders WHERE id=?", (oid,)).fetchone())
    return read


@pytest.fixture
def backdate():
    from datetime import timedelta
    def move(oid, minutes):
        t = (main.datetime.now(main.timezone.utc) - timedelta(minutes=minutes)).isoformat()
        with main.db() as d:
            d.execute("UPDATE orders SET created_at=? WHERE id=?", (t, oid))
    return move


@pytest.fixture(autouse=True)
def clean_state():
    """Every test starts with an empty database and no alert history, so tests cannot affect each other."""
    with main.db() as d:
        for table in ("ledger", "orders", "topups", "users"):
            d.execute(f"DELETE FROM {table}")
    main._last_alert_at.clear()
    yield
