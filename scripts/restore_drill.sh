#!/usr/bin/env bash
# Prove that the newest backup can be restored. Run this monthly, into a SCRATCH database,
# never into production.
#   TEST_DATABASE_URL  an empty, disposable PostgreSQL database
#   BACKUP_DIR         where backup.sh writes (default ./backups)
set -euo pipefail

: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to an empty scratch database (not production)}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
LATEST="$(ls -1t "$BACKUP_DIR"/flux-*.sql.gz 2>/dev/null | head -1 || true)"
[[ -n "$LATEST" ]] || { echo "No PostgreSQL backup found in $BACKUP_DIR" >&2; exit 1; }

# Render's production secret is SUPABASE_DB_URL; DATABASE_URL is the fallback name.
PROD_DSN="${SUPABASE_DB_URL:-${DATABASE_URL:-__unset__}}"
if [[ "$TEST_DATABASE_URL" == "$PROD_DSN" ]]; then
  echo "Refusing: TEST_DATABASE_URL points at the production database." >&2; exit 1
fi

echo "Restoring $LATEST into the scratch database..."
gunzip -c "$LATEST" | psql -v ON_ERROR_STOP=1 -q "$TEST_DATABASE_URL" >/dev/null

echo "Row counts after restore:"
for t in users orders topups ledger; do
  n="$(psql -At -v ON_ERROR_STOP=1 "$TEST_DATABASE_URL" -c "SELECT COUNT(*) FROM $t")"
  printf '  %-8s %s\n' "$t" "$n"
done
echo "Restore drill passed. Compare these counts with production before you rely on the backup."
