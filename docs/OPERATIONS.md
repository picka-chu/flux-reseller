# Operations

This page covers how FLUX tells you when something needs attention, how the data is backed up,
and how to check that the backups work. The step-by-step fixes are in the [Runbook](RUNBOOK.md).

## 1. Alerts

FLUX sends alerts to every Telegram account listed in `ADMIN_TELEGRAM_IDS`, through the bot
(`TELEGRAM_BOT_TOKEN`). Make sure each admin has started a chat with the bot, or Telegram will not
deliver the messages.

| What triggers an alert | When | Message key |
|---|---|---|
| Orders with no supplier record after 15 minutes | Checked every 10 minutes | digest |
| Orders waiting over `OPS_STUCK_MINUTES` (default 30) | Checked every 10 minutes | digest |
| Orders still processing over `OPS_STUCK_MINUTES` | Checked every 10 minutes | digest |
| Top-ups pending over `OPS_TOPUP_STALE_HOURS` (default 12) | Checked every 10 minutes | digest |
| Supplier balance below `SUPPLIER_LOW_BALANCE` | Checked every 10 minutes (if set) | digest |
| Catalogue sync failed 3 times in a row | On the third failure | catalog-sync |
| Order reconciliation crashed | On each crash | reconcile-error |
| Any unhandled server error, per route | On the first occurrence | 500:<path> |

**Noise control.** An alert with the same text is not repeated for `OPS_ALERT_COOLDOWN_MINUTES`
(default 60). An unhandled error on a route alerts once per cooldown, not once per request.

Customers never see internal error details. They get the message "Something went wrong. Please try
again." The real error goes to the server logs and, for admins, to the alert.

**Check alerts are working.** Set `SUPPLIER_LOW_BALANCE` to a number above your real balance for
a few minutes; an admin should receive an "Operations check" message within 10 minutes. Set it back
afterwards.

### Health endpoint

Admins can see the current state at `GET /api/admin/ops` (admin sign-in required). It returns:

- `needs_review`, `needs_review_over_limit`, `flagged_no_supplier_record`
- `processing_over_limit`, `pending_topups`, `topups_over_limit`
- `last_catalog_sync`, `catalog_failures`, `last_reconcile`, `last_reconcile_report`
- `alerts_enabled`: whether alerts can actually be delivered (bot token and admin IDs are set)

If `alerts_enabled` is `false`, **no alerts are being sent**. Fix that first.

### Free hosting warning

`render.yaml` deploys on Render's free plan. Free services go to sleep when idle, and the sync,
reconciliation and alert loops stop while the service sleeps. Use a paid instance for production, or
accept that orders may wait until the next visit. This is a cost decision for the owner.

## 2. Backups

The database holds customer balances, orders, deposits and support history. It must be backed up.

### Production (PostgreSQL / Supabase)

1. **Turn on the provider's own backups.** Supabase backups depend on the plan: check the Supabase
   dashboard under *Database → Backups*, and enable point-in-time recovery if you can.
2. **Run our own nightly dump** as a scheduled job, so you have a copy you control:
   - Create a Render *Cron Job* (or any scheduler with `pg_dump` 15+ installed).
   - Command: `bash scripts/backup.sh`
   - Schedule: `0 2 * * *` (02:00 UTC every day)
   - Environment: `DATABASE_URL` (the production connection string), `BACKUP_DIR`, `BACKUP_KEEP_DAYS=30`
   - Store the dumps somewhere other than the server that runs the app (for example, an encrypted
     cloud bucket). A backup kept only on the same machine is not a backup.
3. **Restore drill, monthly.** Run `scripts/restore_drill.sh` against an empty scratch database,
   never production. Compare the row counts printed with the live database. If the drill fails, you
   do not have a working backup, even if the dump file exists.

### Local / development (SQLite)

`DATABASE_PATH=./flux.db bash scripts/backup.sh` writes a consistent copy into `./backups`.

## 3. Retention and recovery targets

| Item | Target |
|---|---|
| Keep daily backups | 30 days (`BACKUP_KEEP_DAYS`) |
| Restore drill | Monthly, recorded in your admin log |
| Recovery point | Last nightly dump, or point-in-time if your plan supports it |
| Recovery time | Set this after your first drill; record the real time it took |

## 4. Who does what

- **Daily (5 minutes):** read the alerts, check Needs review and top-ups in the admin console.
- **Weekly:** check the supplier balance and the catalogue sync date in `/api/admin/ops`.
- **Monthly:** restore drill; review refund and support volumes; rotate nothing unless there is a reason.
- **After any incident:** write down what happened and what changed, in a short note in your admin log.
