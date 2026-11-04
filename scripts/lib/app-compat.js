// Menyusun skrip mongo/mongosh untuk scripts/app-compat.sh: kompatibilitas aplikasi Android Genieacs.apk (Alijaya).
// Pakai: node app-compat.js <root-repo> <output.js> apply=0|1
//
// Aplikasi membaca Virtual Parameter WlanSSID, MacAddress, dan TXPower. Nilai VP hanya terisi bila provision "default"
// men-declare-nya, sedangkan installer tidak menimpa provision "default" yang sudah ada. Skrip ini menambahkan:
//   1. VP yang belum ada (tidak menimpa VP yang sudah ada dan berbeda),
//   2. satu baris declare per VP ke provision "default" yang SUDAH ADA (hanya bila belum ada, di titik sisip yang dikenal).
"use strict";
const fs = require("fs");
const path = require("path");

const [root, out, ...kv] = process.argv.slice(2);
const opt = Object.fromEntries(kv.map((s) => s.split("=")));
const read = (n) => ({ _id: n, script: fs.readFileSync(path.join(root, "virtual-parameters", n + ".js"), "utf8") });

const VPS = ["WlanSSID", "MacAddress", "TXPower"].map(read);
// {vp, after, line}: sisipkan `line` tepat sesudah baris yang memuat `after`
const DECL = [
  { vp: "TXPower", after: 'declare("VirtualParameters.RXPower"', line: '  declare("VirtualParameters.TXPower", {path: hourly, value: hourly});   // app Android (Genieacs.apk)' },
  { vp: "WlanSSID", after: 'declare("VirtualParameters.PonMac"', line: 'declare("VirtualParameters.WlanSSID", {path: daily, value: daily});   // app Android (Genieacs.apk)' },
  { vp: "MacAddress", after: 'declare("VirtualParameters.PonMac"', line: 'declare("VirtualParameters.MacAddress", {path: daily, value: daily});   // app Android (Genieacs.apk)' }
];

const body = `
(function () {
  var APPLY = ${opt.apply === "1" ? "true" : "false"};
  var VPS = ${JSON.stringify(VPS)};
  var DECL = ${JSON.stringify(DECL)};
  function say(s) { print(s); }
  say("== Kompatibilitas aplikasi Android (Genieacs.apk): " + (APPLY ? "MENERAPKAN" : "PERIKSA SAJA (tidak menulis)"));

  // 1. Virtual Parameter
  VPS.forEach(function (d) {
    var cur = db.virtualParameters.findOne({_id: d._id});
    if (!cur) {
      say("VP " + d._id + ": belum ada" + (APPLY ? " -> ditambahkan" : " (akan ditambahkan)"));
      if (APPLY) db.virtualParameters.insertOne(d);
    } else if (cur.script === d.script) say("VP " + d._id + ": sudah ada, sama dengan repo");
    else say("VP " + d._id + ": sudah ada tetapi BERBEDA dengan repo -> tidak ditimpa");
  });

  // 2. provision default
  var p = db.provisions.findOne({_id: "default"});
  if (!p) {
    say("provision default: TIDAK ADA di server -> tidak ada yang diubah (jalankan scripts/install.sh dulu)");
  } else {
    var s = p.script, added = [], todo = [];
    DECL.forEach(function (x) {
      if (s.indexOf('"VirtualParameters.' + x.vp + '"') >= 0) { say("default: declare " + x.vp + " sudah ada"); return; }
      var i = s.indexOf(x.after);
      if (i < 0) { todo.push(x); say("default: titik sisip untuk " + x.vp + " tidak ditemukan -> tambahkan manual: " + x.line.trim()); return; }
      var eol = s.indexOf("\\n", i);
      if (eol < 0) eol = s.length;
      s = s.slice(0, eol + 1) + x.line + "\\n" + s.slice(eol + 1);
      added.push(x.vp);
    });
    if (added.length) {
      say("default: " + (APPLY ? "ditambah declare " : "akan ditambah declare ") + added.join(", "));
      if (APPLY) db.provisions.updateOne({_id: "default"}, {$set: {script: s}});
    }
  }
  if (APPLY) { db.cache.deleteMany({_id: {$in: ["ui-local-cache-hash", "cwmp-local-cache-hash"]}}); say("Cache GenieACS dibersihkan"); }
})();
`;
fs.writeFileSync(out, body);
