#!/usr/bin/env bash
# Backup koleksi GenieACS yang disentuh installer (config, virtualParameters, provisions, presets).
# Pakai:  bash scripts/backup.sh [folder-tujuan]          -> cetak path folder backup
#         bash scripts/backup.sh --full [folder-tujuan]   -> + dump seluruh database (termasuk devices)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${GENIEACS_DB:-genieacs}"
FULL=0
if [ "${1:-}" = "--full" ]; then FULL=1; shift; fi
OUT="${1:-$ROOT/backups/$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$OUT"
for c in config virtualParameters provisions presets; do
  mongodump --quiet --db "$DB" --collection "$c" --archive="$OUT/$c.archive.gz" --gzip
  # koleksi belum ada -> tidak ada archive; tandai supaya restore mengosongkannya
  [ -s "$OUT/$c.archive.gz" ] || { rm -f "$OUT/$c.archive.gz"; touch "$OUT/$c.empty"; }
done
if [ $FULL = 1 ]; then
  mongodump --quiet --db "$DB" --archive="$OUT/full-$DB.archive.gz" --gzip
fi
echo "$OUT"
