#!/usr/bin/env bash
# Dumps the CatMap Postgres database to a timestamped, gzip-compressed file.
#
# Usage:
#   DATABASE_URL=postgresql://user:pass@host:5432/catmap ./backup_db.sh [output_dir]
#
# Requires `pg_dump` (postgresql-client). Accepts SQLAlchemy's
# `postgresql+psycopg://` URL form as well as plain `postgresql://`.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set (Postgres connection string)}"

OUTPUT_DIR="${1:-./backups}"
mkdir -p "$OUTPUT_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTFILE="$OUTPUT_DIR/catmap-${TIMESTAMP}.sql.gz"

# pg_dump doesn't understand SQLAlchemy's "+psycopg" driver suffix.
PG_URL="${DATABASE_URL/postgresql+psycopg:/postgresql:}"

echo "Dumping database to $OUTFILE ..."
pg_dump --no-owner --no-privileges "$PG_URL" | gzip > "$OUTFILE"
echo "Wrote $OUTFILE ($(du -h "$OUTFILE" | cut -f1))"
