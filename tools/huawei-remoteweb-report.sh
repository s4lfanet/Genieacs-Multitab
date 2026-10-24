#!/bin/bash
# LAPORAN SAJA - tidak mengubah ONT apa pun.
# Mencari ONT Huawei online yang web GUI-nya tidak bisa dibuka dari WAN (IP PPPoE maupun IP TR069),
# membaca ulang tabel ACL-nya (refresh = baca), lalu menulis penyebab yang terdeteksi.
#
# Pemakaian (di VPS, folder ~/genieacs-backup):
#   bash huawei-remoteweb-report.sh
# Hasil juga ditambahkan ke huawei-remoteweb-report.log
#
# Jenis penyebab:
#   BLOK-HTTP   aturan AccessControl blokir (Mode 1, sisi WAN) berisi HTTP
#               -> perbaiki: bash fix-huawei-acl.sh <file-daftar> apply
#   BLOK-PORT80 aturan blokir berbasis port 80 (ServiceProtoPort)
#   WANACC-KOSONG  WanAccess aktif tapi WanName kosong
#   TANPA-IZIN  ACL aktif tanpa aturan izin HTTP sisi WAN (Mode 0, sisi WAN)
#   LAIN        tidak ada pola di atas (cek manual)

NBI=http://127.0.0.1:7557
SEC=InternetGatewayDevice.X_HW_Security.AclServices
LOG=$HOME/genieacs-backup/huawei-remoteweb-report.log

enc() { printf '%s' "$1" | sed 's/%/%25/g; s/ /%20/g'; }
web() { if [ -n "$1" ] && [ "$1" != "-" ]; then curl -s -m 5 -o /dev/null -w '%{http_code}' "http://$1/"; else echo 000; fi; }

mongo genieacs --quiet --eval '
  db.devices.find({"_deviceId._Manufacturer": /Huawei/, _lastInform: {$gt: new Date(Date.now() - 900000)}},
    {"VirtualParameters.pppoeIP": 1, "VirtualParameters.IPTR069": 1, "VirtualParameters.pppoeUsername": 1}).forEach(function(d){
    var v = d.VirtualParameters || {};
    print(d._id + " " + (v.pppoeIP && v.pppoeIP._value || "-") + " " + (v.IPTR069 && v.IPTR069._value || "-") + " " + (v.pppoeUsername && v.pppoeUsername._value || "-"));
  })' > /tmp/hw-report-online.lst

TOTAL=$(wc -l < /tmp/hw-report-online.lst)
: > /tmp/hw-report-closed.lst
while read -r ID P T U; do
  [ "$(web "$P")" != "000" ] && continue
  [ "$(web "$T")" != "000" ] && continue
  echo "$ID $P $T $U" >> /tmp/hw-report-closed.lst
done < /tmp/hw-report-online.lst

{
  echo "===== $(date -u +%FT%TZ) Huawei online: $TOTAL, web tertutup: $(wc -l < /tmp/hw-report-closed.lst)"
  while read -r ID P T U; do
    rc=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$NBI/devices/$(enc "$ID")/tasks?connection_request&timeout=40000" \
      --data "{\"name\":\"refreshObject\",\"objectName\":\"$SEC\"}")
    if [ "$rc" != "200" ]; then echo "OFFLINE  $ID ($U) ppp=$P tr069=$T"; continue; fi
    mongo genieacs --quiet --eval "
      var d = db.devices.findOne({_id: '$ID'});
      var a = d.InternetGatewayDevice.X_HW_Security && d.InternetGatewayDevice.X_HW_Security.AclServices;
      var why = [];
      var ac = a && a.AccessControl, aclOn = ac && ac.AccessControlListEnable && String(ac.AccessControlListEnable._value) === 'true';
      var permit = false;
      if (ac && ac.List) for (var i in ac.List) { if (i[0] === '_') continue; var l = ac.List[i];
        var m = l.Mode ? l.Mode._value : null, t = l.SrcPortType ? l.SrcPortType._value : null;
        var sp = l.ServicePort ? String(l.ServicePort._value).split(',') : [];
        var port = l.ServiceProtoPort ? String(l.ServiceProtoPort._value) : '';
        if (m == 1 && t == 2 && sp.indexOf('HTTP') >= 0) why.push('BLOK-HTTP(List.' + i + ')');
        if (m == 1 && t == 2 && port.split(',').indexOf('80') >= 0) why.push('BLOK-PORT80(List.' + i + ')');
        if (m == 0 && t == 2 && sp.indexOf('HTTP') >= 0) permit = true; }
      var wa = a && a.WanAccess;
      if (wa) for (var j in wa) { if (j[0] === '_') continue; var w = wa[j];
        if (w.Enable && String(w.Enable._value) === '1' && w.WanName && !w.WanName._value) why.push('WANACC-KOSONG(WanAccess.' + j + ')'); }
      if (aclOn && !permit && !why.length) why.push('TANPA-IZIN');
      if (!why.length) why.push('LAIN');
      print(why.join(',') + '  $ID ($U) ppp=$P tr069=$T');"
  done < /tmp/hw-report-closed.lst
} | tee -a "$LOG"
