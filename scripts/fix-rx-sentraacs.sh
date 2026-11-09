#!/usr/bin/env bash
# Perbaikan sensor optik RX untuk aplikasi Android SentraACS / Genieacs.apk.
#  - VP RXPower, redaman, TXPower: keluaran angka dBm ("-14.00", "2.00") atau "N/A", seperti alijayanet/genieacs-multitab-mod.
#  - provision default: declare VirtualParameters.redaman (sebelumnya tidak pernah dihitung; hanya 3 dari 640 ONT terisi).
# Backup koleksi virtualParameters/provisions dibuat dulu di ~/backup-vp/<waktu>.
# Pakai: bash scripts/fix-rx-sentraacs.sh            (dari root repo, di server GenieACS)
# Kembalikan: mongorestore --drop --db genieacs ~/backup-vp/<waktu>/genieacs
set -euo pipefail
cd "$(dirname "$0")/.."

TS=$(date +%Y%m%d-%H%M%S); B=~/backup-vp/$TS
mkdir -p "$B"
for c in virtualParameters provisions; do mongodump --quiet --db genieacs --collection "$c" --out "$B"; done
echo "Backup: $B"

cd virtual-parameters
mongo --quiet genieacs --eval '
["RXPower","redaman","TXPower"].forEach(function(n){
  var r=db.virtualParameters.updateOne({_id:n},{$set:{script:cat(n+".js")}},{upsert:true});
  print("VP "+n+": modified="+r.modifiedCount+(r.upsertedCount?" (baru)":""));
});
var p=db.provisions.findOne({_id:"default"});
var anchor="  declare(\"VirtualParameters.RXPower\", {path: update, value: update});";
var line="  declare(\"VirtualParameters.redaman\", {path: update, value: update});   // app Android (SentraACS)";
if(!p){print("provision default TIDAK ADA");}
else if(p.script.indexOf("VirtualParameters.redaman")>=0){print("provision default: redaman sudah di-declare");}
else if(p.script.indexOf(anchor)<0){print("provision default: baris RXPower tidak ditemukan; tambahkan manual:\n"+line);}
else{var r=db.provisions.updateOne({_id:"default"},{$set:{script:p.script.replace(anchor,anchor+"\n"+line)}});print("provision default: modified="+r.modifiedCount);}
'
echo "Selesai. Nilai terisi ulang saat tiap ONT inform berikutnya."
