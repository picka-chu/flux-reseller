#!/usr/bin/env bash
# Back up the FLUX database.
#   Production (SUPABASE_DB_URL or DATABASE_URL set):  pg_dump, compressed, into $BACKUP_DIR
#   Local (only DATABASE_PATH set):  copy of the SQLite file, taken safely while the app runs
# Keeps $BACKUP_KEEP_DAYS days of backups (default 30) and deletes older ones.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"

# Render's production secret is SUPABASE_DB_URL; DATABASE_URL is the fallback name.
# Accept either so the nightly job hits Postgres, not the ephemeral SQLite file.
DB_DSN="${SUPABASE_DB_URL:-${DATABASE_URL:-}}"

if [[ -n "$DB_DSN" ]]; then
  OUT="$BACKUP_DIR/flux-$STAMP.sql.gz"
  command -v pg_dump >/dev/null || { echo "pg_dump is not installed" >&2; exit 1; }
  umask 077
  pg_dump --no-owner --no-privileges --format=plain "$DB_DSN" | gzip -9 > "$OUT.tmp"
  mv "$OUT.tmp" "$OUT"
else
  SRC="${DATABASE_PATH:-./flux.db}"
  [[ -f "$SRC" ]] || { echo "No database found at $SRC (neither SUPABASE_DB_URL nor DATABASE_URL set, and $SRC missing)" >&2; exit 1; }
  OUT="$BACKUP_DIR/flux-$STAMP.db"
  umask 077
  # sqlite3 .backup is safe while the app is writing; a plain copy can be torn.
  if command -v sqlite3 >/dev/null; then
    sqlite3 "$SRC" ".backup '$OUT'"
  else
    cp "$SRC" "$OUT"
  fi
fi

# Never keep an empty file as a "backup".
[[ -s "$OUT" ]] || { echo "Backup came out empty: $OUT" >&2; exit 1; }
find "$BACKUP_DIR" -name 'flux-*' -type f -mtime +"$KEEP_DAYS" -delete
echo "Backup written: $OUT ($(du -h "$OUT" | cut -f1))"
