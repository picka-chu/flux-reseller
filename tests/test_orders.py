"""Money-path tests: every purchase must end with the customer charged once and delivered or refunded once."""
import asyncio
from datetime import datetime, timedelta, timezone

import main

START = 5000  # $50.00


def product_id(client):
    return next(p for p in client.get("/api/products").json() if p["name"] == "Spotify Premium")


def test_catalogue_lists_sold_out_items_with_flag(client):
    assert any(p["in_stock"] for p in client.get("/api/products").json())


def test_ambiguous_success_is_reconciled_and_charged_once(client, supplier, user_balance, balance, order_row):
    pid = product_id(client); price = round(pid["price"] * 100)
    user_balance(START); supplier.mode = "ghost"
    r = client.post("/api/orders", json={"product_id": pid["id"]}).json()
    assert r["status"] == "needs_review"
    assert balance() == START - price

    report = asyncio.run(main.reconcile_unclear_orders())
    assert report["delivering"] == 1
    asyncio.run(main.sync_supplier_orders())
    assert order_row(r["id"])["status"] == "delivered"
    assert balance() == START - price            # no refund, no second charge


def test_explicit_supplier_failure_without_record_refunds_now(client, supplier, user_balance, balance):
    pid = product_id(client); user_balance(START); supplier.mode = "failed"
    r = client.post("/api/orders", json={"product_id": pid["id"]})
    assert r.status_code == 400
    assert balance() == START


def test_clean_rejection_refunds_exactly(client, supplier, user_balance, balance):
    pid = product_id(client); user_balance(START); supplier.mode = "insufficient"
    r = client.post("/api/orders", json={"product_id": pid["id"]})
    assert r.status_code == 400
    assert balance() == START


def test_unmatched_waits_then_flags_then_admin_refunds_once(client, supplier, user_balance, balance, order_row, backdate):
    pid = product_id(client); price = round(pid["price"] * 100)
    user_balance(START); supplier.mode = "unmatched"
    r = client.post("/api/orders", json={"product_id": pid["id"]}).json()

    assert asyncio.run(main.reconcile_unclear_orders())["waiting"] == 1
    assert order_row(r["id"])["status"] == "needs_review"

    backdate(r["id"], 20)
    assert asyncio.run(main.reconcile_unclear_orders())["flagged"] == 1
    assert order_row(r["id"])["review_note"]
    assert balance() == START - price            # never refunded automatically

    first = client.post(f"/api/admin/orders/{r['id']}", json={"status": "refunded", "note": "not placed"})
    second = client.post(f"/api/admin/orders/{r['id']}", json={"status": "refunded"})
    assert first.status_code == 200
    assert second.status_code == 409             # double click cannot pay twice
    assert balance() == START
    assert main.refund_order(r["id"], main.ADMIN_IDS.copy().pop(), price, "again") is False


def test_pending_at_supplier_links_then_delivers(client, supplier, user_balance, order_row):
    pid = product_id(client); user_balance(START); supplier.mode = "pending"
    r = client.post("/api/orders", json={"product_id": pid["id"]}).json()
    asyncio.run(main.reconcile_unclear_orders())
    row = order_row(r["id"])
    assert row["status"] == "processing" and row["supplier_order_code"]

    for o in supplier.orders:
        if o["orderCode"] == row["supplier_order_code"]:
            o["status"] = "completed"
    asyncio.run(main.sync_supplier_orders())
    assert order_row(r["id"])["status"] == "delivered"


def test_two_orders_one_supplier_record_are_not_guessed(client, supplier, user_balance, order_row):
    pid = product_id(client); user_balance(START * 2); supplier.mode = "unmatched"
    a = client.post("/api/orders", json={"product_id": pid["id"]}).json()
    b = client.post("/api/orders", json={"product_id": pid["id"]}).json()
    supplier.orders.append({"orderCode": "rs_9999", "productId": 101, "quantity": 1, "status": "completed",
                            "createdAt": datetime.now(timezone.utc).isoformat(), "error": None})
    report = asyncio.run(main.reconcile_unclear_orders())
    assert report["ambiguous"] == 2
    assert order_row(a["id"])["status"] == "needs_review"
    assert order_row(b["id"])["status"] == "needs_review"


def test_refund_is_idempotent(user_balance, balance):
    user_balance(START)
    with main.db() as d:
        d.execute("INSERT INTO orders(id,telegram_id,product_id,price_cents,status,created_at) VALUES('OR-IDEM',100000001,'x',100,'processing','2026-01-01T00:00:00+00:00')")
    assert main.refund_order("OR-IDEM", 100000001, 100, "one") is True
    assert main.refund_order("OR-IDEM", 100000001, 100, "two") is False
    assert balance() == START + 100
