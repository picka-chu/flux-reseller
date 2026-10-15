# Runbook

Use this when an alert arrives or when you are doing the daily check. Each section starts with what
you see, then what to do. Admin actions are in the admin console (`/admin`) unless stated.

## Daily check (5 minutes)

1. Open **Overview**. Look at *Needs attention*.
2. **Needs review** should be 0, or only orders that were created in the last 30 minutes.
3. **Top-ups** should be 0 or only recent requests.
4. Read every alert from the bot since yesterday. Each one has a playbook below.
5. Once a week, check `/api/admin/ops`: `alerts_enabled` must be `true`, and `last_catalog_sync`
   must be recent (within twice `CATALOG_SYNC_MINUTES`).

## Order states, in one table

| Status shown | Meaning | Customer sees | Who acts |
|---|---|---|---|
| processing | Sent to the supplier; waiting for the result | "Processing" | Nobody, unless stuck over 30 min |
| needs review | The supplier's answer was unclear | "We're confirming this order" | Automatic check every 2 min; admin if flagged |
| delivered | Complete; details shown under Orders | The details | Nobody |
| refunded | Money returned to the wallet | "Refunded" note | Nobody |

## Playbook 1: Needs review, not flagged yet

**What you see:** an order in *needs review* for under 15 minutes, or an alert saying orders are waiting
for supplier confirmation.

**Do:** nothing yet. The app checks the supplier's own order list every 2 minutes and resolves most
cases by itself.

**If it stays in review for more than 30 minutes:** go to Playbook 3.

## Playbook 2: Flagged — supplier has no record

**What you see:** an alert "N order(s) have no supplier record after 15 minutes", and the order has a
note on it.

1. Open the supplier's panel or reseller API `GET /orders`. Search for the product and the time the
   order was created (the admin list shows both).
2. **If you find the order and it is completed:** mark it *delivered* and paste the delivery details
   into the note, so the customer can see them under Orders.
   **If it is still pending at the supplier:** leave it in review and check again in an hour.
   (Finding the order yourself means the automatic match failed. Note what you found.)
3. **If you find no order:** the supplier never placed it. Click **Refund** and add a note such as
   "Checked supplier panel 15 Oct 14:30: not placed". The customer's wallet is credited once. A second
   refund is refused automatically.
4. Record what you decided in your admin log.

**Never** refund a flagged order without checking the supplier first. The supplier may already have
processed it, and a refund then costs you twice.

## Playbook 3: Stuck in processing over 30 minutes

1. Open the order in the admin console and copy its supplier order code.
2. Check the supplier order status for that code.
3. **Completed:** the next sync will deliver it. To deliver it now, mark it *delivered* with the
   delivery details as the note.
4. **Failed or cancelled:** click **Refund** with a note stating the supplier's status.
5. **Still pending at the supplier:** leave it, and check again the next morning.

## Playbook 4: Top-up needs verifying

1. Open **Top-ups**. Each request shows the method, the exact amount and the reference.
2. In your Bybit or Telegram Wallet history, find a transfer with the **exact amount** (including the
   small fraction at the end) and the **reference** the customer quoted, if they quoted one.
3. **Matches:** approve. The wallet is credited once.
4. **Does not match, or nothing arrived:** reject with a reason, or wait for the customer to send the
   right amount. A request expires after the time shown in the app.
5. **Never approve** on the strength of a reference the customer typed. Only the money in your account
   counts.

## Playbook 5: Catalogue sync failing

**Alert:** "Catalogue sync has failed 3 times in a row."

1. Check `SUPPLIER_API_KEY` in Render (it must be set and not expired).
2. Check the supplier's status page or try the products endpoint from your own computer with the key.
3. If the supplier is down, orders will land in *needs review*. Either wait, or switch off the affected
   products in **Catalog** so customers cannot buy while the supplier is unavailable.
4. When the supplier recovers, the next sync runs automatically. Check `last_catalog_sync` updates.

## Playbook 6: Supplier balance is low

**Alert:** "Supplier balance is low."

1. Top up the supplier store balance **before** it reaches zero. Orders fail with "insufficient funds"
   when it does, and each failed order is refunded to the customer, which is correct but annoying.
2. Adjust `SUPPLIER_LOW_BALANCE` if the threshold is too close to your normal spend.

## Playbook 7: Unexpected server error

**Alert:** "Unhandled error on POST /api/…".

1. Open the Render logs and search for `Unhandled error on` at the same time.
2. Check whether customers can still buy and deposit. If the failing route is a purchase or deposit route,
   switch off the affected products in **Catalog** until the fix is deployed.
3. Fix, test, and deploy. Then check the route in a real Telegram session.

## Playbook 8: Customer refund request

1. Ask for the **order ID**. Check it in the admin console.
2. Apply the [Refund Policy](legal/refund-policy.md) exactly. Note the decision.
3. If refunding: use **Refund** with a note. Do not credit the wallet by hand; manual balance edits
   bypass the ledger.
4. Reply in support with the outcome and the timescale.

## Playbook 9: Restoring the database

Use only if data was lost or corrupted.

1. Stop customer activity: switch off all products in **Catalog** and announce a pause through the bot.
2. Restore the latest good backup into a **new** database (`scripts/restore_drill.sh` shows how).
3. Compare row counts and the newest order date with what you expect.
4. Point `DATABASE_URL` at the restored database and redeploy.
5. Check balances for a few customers against the ledger, then re-enable products.
6. Write up what was lost, if anything, and between which times.

## Playbook 10: Rotating a leaked secret

Rotate immediately if a token, key or password appears in chat, a screenshot, a commit or a log.

| Secret | Where to rotate | Then |
|---|---|---|
| GitHub token | github.com → Settings → Developer settings | Delete the old one |
| `TELEGRAM_BOT_TOKEN` | Telegram @BotFather → `/revoke` | Update Render, redeploy |
| `TELEGRAM_WEBHOOK_SECRET` | Generate a new random value | Update Render; webhook re-registers on deploy |
| `SUPPLIER_API_KEY` | Supplier dashboard | Update Render; check `last_catalog_sync` |
| Database password | Supabase project settings | Update `DATABASE_URL`, redeploy |

## Playbook 11: Adding or removing an admin

1. Edit `ADMIN_TELEGRAM_IDS` in Render (comma-separated Telegram user IDs).
2. Redeploy. Removing someone takes effect on the next request.
3. Ask the admin to start the bot, so they receive alerts.
