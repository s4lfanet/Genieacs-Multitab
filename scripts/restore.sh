#!/usr/bin/env bash
# Kembalikan koleksi dari folder backup buatan backup.sh / install.sh.
# Pakai:  bash scripts/restore.sh <folder-backup>
# Koleksi yang ada di folder (config, virtualParameters, provisions, presets) DIGANTI isinya.
# full-*.archive.gz TIDAK direstore otomatis (lihat docs/BACKUP-RESTORE.md).
set -euo pipefail
BK="${1:?pakai: restore.sh <folder-backup>}"
DB="${GENIEACS_DB:-genieacs}"
MONGO="$(command -v mongo || command -v mongosh)"
for c in config virtualParameters provisions presets; do
  f="$BK/$c.archive.gz"
  if [ -f "$BK/$c.empty" ]; then
    "$MONGO" "$DB" --quiet --eval "db.getCollection('$c').deleteMany({})" >/dev/null
    echo "restore $c: dikosongkan (belum ada saat backup)"
    continue
  fi
  [ -f "$f" ] || continue
  # kosongkan dulu: bila koleksi belum ada saat backup, archive-nya kosong dan --drop saja tidak cukup
  "$MONGO" "$DB" --quiet --eval "db.getCollection('$c').deleteMany({})" >/dev/null
  mongorestore --quiet --drop --gzip --archive="$f" --nsInclude "$DB.$c"
  echo "restore $c: ok"
done
"$MONGO" "$DB" --quiet --eval 'db.cache.deleteMany({_id: {$in: ["ui-local-cache-hash", "cwmp-local-cache-hash"]}})' >/dev/null
echo "cache dibersihkan; tekan Ctrl+F5 di browser"
