#!/bin/bash
# Buka web GUI dari WAN di Huawei (HG8145V5 dsb) yang diblokir oleh tabel ACL
# X_HW_Security.AclServices.AccessControl: dari aturan Mode=1 sisi WAN (SrcPortType=2),
# buang "HTTP" saja; aturan yang isinya hanya HTTP diganti "FTP" (FTPWanEnable sudah false).
#
# Pemakaian (di VPS):
#   bash fix-huawei-acl.sh <file-daftar-device-id>          # dry-run: hanya baca + tampilkan rencana
#   bash fix-huawei-acl.sh <file-daftar-device-id> apply    # kirim perubahan
# Satu device per baris. Output per device: hasil rencana/eksekusi + cek web WAN + fault.

LIST=$1
MODE=${2:-dry}
NBI=http://127.0.0.1:7557
ACL=InternetGatewayDevice.X_HW_Security.AclServices.AccessControl
# MongoDB 6+ tidak lagi menyertakan shell lama "mongo", hanya "mongosh"
MONGO="$(command -v mongo || command -v mongosh)"
[ -n "$MONGO" ] || { echo 'ERROR: shell mongo tidak ditemukan ("mongosh" atau "mongo")'; exit 1; }

enc() { printf '%s' "$1" | sed 's/%/%25/g; s/ /%20/g'; }

while read -r ID; do
  [ -z "$ID" ] && continue
  E=$(enc "$ID")

  # 1. baca ulang tabel ACL dari ONT
  rc=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$NBI/devices/$E/tasks?connection_request&timeout=40000" \
    --data "{\"name\":\"refreshObject\",\"objectName\":\"$ACL\"}")
  if [ "$rc" != "200" ]; then echo "SKIP  $ID refresh=$rc (offline/timeout)"; continue; fi

  # 2. hitung perubahan dari data yang baru dibaca
  PLAN=$($MONGO genieacs --quiet --eval "
    var d = db.devices.findOne({_id: '$ID'}, {'InternetGatewayDevice.X_HW_Security.AclServices.AccessControl': 1, 'VirtualParameters.pppoeIP': 1});
    var a = d.InternetGatewayDevice.X_HW_Security && d.InternetGatewayDevice.X_HW_Security.AclServices.AccessControl, pv = [];
    if (a && a.List) for (var i in a.List) { if (i[0] === '_') continue; var l = a.List[i];
      if (!l.ServicePort || !l.Mode || !l.SrcPortType || l.Mode._value != 1 || l.SrcPortType._value != 2) continue;
      var s = String(l.ServicePort._value).split(',').map(function(x){ return x.trim(); }).filter(function(x){ return x; });
      if (s.indexOf('HTTP') < 0) continue;
      var r = s.filter(function(x){ return x !== 'HTTP'; });
      pv.push(['$ACL.List.' + i + '.ServicePort', r.length ? r.join(',') : 'FTP', 'xsd:string']); }
    var ip = d.VirtualParameters && d.VirtualParameters.pppoeIP ? d.VirtualParameters.pppoeIP._value : '';
    print(ip + '\t' + JSON.stringify(pv));")
  IP=${PLAN%%$'\t'*}; PV=${PLAN#*$'\t'}

  if [ "$PV" = "[]" ]; then
    echo "OK    $ID tidak ada aturan HTTP yang memblokir | web=$(curl -s -m 5 -o /dev/null -w '%{http_code}' http://$IP/)"
    continue
  fi

  if [ "$MODE" != "apply" ]; then
    echo "PLAN  $ID ip=$IP $PV"
    continue
  fi

  # 3. kirim satu SetParameterValues
  rc=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$NBI/devices/$E/tasks?connection_request&timeout=40000" \
    --data "{\"name\":\"setParameterValues\",\"parameterValues\":$PV}")
  sleep 3
  web=$(curl -s -m 5 -o /dev/null -w '%{http_code}' http://$IP/)
  nf=$($MONGO genieacs --quiet --eval "print(db.faults.count({device: '$ID'}))")
  echo "DONE  $ID spv=$rc web=$web faults=$nf"
done < "$LIST"
