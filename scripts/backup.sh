#!/usr/bin/env bash
# Back up the FLUX database.
#   Production (DATABASE_URL set):   pg_dump, compressed, into $BACKUP_DIR
#   Local (only DATABASE_PATH set):  copy of the SQLite file, taken safely while the app runs
# Keeps $BACKUP_KEEP_DAYS days of backups (default 30) and deletes older ones.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"

if [[ -n "${DATABASE_URL:-}" ]]; then
  OUT="$BACKUP_DIR/flux-$STAMP.sql.gz"
  command -v pg_dump >/dev/null || { echo "pg_dump is not installed" >&2; exit 1; }
  pg_dump --no-owner --no-privileges --format=plain "$DATABASE_URL" | gzip -9 > "$OUT.tmp"
  mv "$OUT.tmp" "$OUT"
else
  SRC="${DATABASE_PATH:-./flux.db}"
  [[ -f "$SRC" ]] || { echo "No database found at $SRC" >&2; exit 1; }
  OUT="$BACKUP_DIR/flux-$STAMP.db"
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
