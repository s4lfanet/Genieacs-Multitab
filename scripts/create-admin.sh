#!/usr/bin/env bash
# Buat user admin pertama untuk GenieACS yang baru diinstal (fresh install) dan
# berikan izin penuh (role "admin" ke 9 resource). Tanpa ini, user baru bisa
# login tapi akan melihat "You are not authorized to view this page" di semua
# halaman, karena koleksi `permissions` masih kosong.
#
# Pemakaian:
#   bash scripts/create-admin.sh <username> <password>
#   bash scripts/create-admin.sh admin 'Passw0rd!Kuat'
#
# Aman dijalankan berkali-kali: user & permission di-upsert (replace), bukan ditambah dobel.
# Hash password: pbkdf2(password, salt, 10000, 128, "sha512"), salt = randomBytes(64) -- hex.
# Diverifikasi cocok dengan source GenieACS 1.2.13 (bin/genieacs-ui). Cek ulang
# kalau Anda memakai versi GenieACS yang jauh berbeda (lihat docs/INSTALL.md).
set -euo pipefail
DB="${GENIEACS_DB:-genieacs}"
USER="${1:-}"; PASS="${2:-}"
if [ -z "$USER" ] || [ -z "$PASS" ]; then
  echo "Pakai: bash scripts/create-admin.sh <username> <password>"
  exit 2
fi

MONGO="$(command -v mongosh || command -v mongo || true)"
[ -n "$MONGO" ] || { echo 'ERROR: shell mongo tidak ditemukan ("mongosh" atau "mongo")'; exit 1; }

node -e '
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const [, mongoBin, db, user, pass] = process.argv;
const salt = crypto.randomBytes(64).toString("hex");
const hash = crypto.pbkdf2Sync(pass, salt, 10000, 128, "sha512").toString("hex");
const js = `
var res = ["devices","faults","files","presets","users","virtualParameters","permissions","provisions","config"];
db.users.updateOne({_id:${JSON.stringify(user)}}, {$set:{password:${JSON.stringify(hash)}, salt:${JSON.stringify(salt)}, roles:"admin"}}, {upsert:true});
res.forEach(function(r){db.permissions.updateOne({_id:"admin:"+r+":3"},{$set:{role:"admin",resource:r,access:3,validate:"true"}},{upsert:true})});
db.cache.deleteMany({_id:{$in:["ui-local-cache-hash","cwmp-local-cache-hash"]}});
print("user " + ${JSON.stringify(user)} + " siap, permissions: " + db.permissions.countDocuments());
`;
execFileSync(mongoBin, [db, "--quiet", "--eval", js], { stdio: "inherit" });
' "$MONGO" "$DB" "$USER" "$PASS"

echo "Login di UI GenieACS: $USER / (password yang baru saja Anda masukkan)"
