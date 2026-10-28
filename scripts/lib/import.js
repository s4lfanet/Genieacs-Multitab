// Logika import (dijalankan di mongo/mongosh). BUNDLE didefinisikan oleh bundle.js.
// ES5 supaya jalan di mongo shell lama maupun mongosh.
(function () {
  var B = BUNDLE, dry = B.dry;
  function say(s) { print((dry ? "[dry-run] " : "") + s); }
  var OW = !!B.overwrite, skipped = [];
  function upsert(coll, doc) { if (!dry) db.getCollection(coll).replaceOne({_id: doc._id}, doc, {upsert: true}); }
  function canon(o) {
    if (Array.isArray(o)) return o.map(canon);
    if (o && typeof o === "object") { var r = {}; Object.keys(o).sort().forEach(function (k) { r[k] = canon(o[k]); }); return r; }
    return o;
  }
  // Pasang dokumen kalau belum ada; kalau sudah ada dan BERBEDA, hanya ditimpa dengan --overwrite.
  // Kembalian: "baru" | "sama" | "diperbarui" | "dilewati"
  function put(coll, doc, same) {
    var cur = db.getCollection(coll).findOne({_id: doc._id});
    if (!cur) { upsert(coll, doc); return "baru"; }
    if (same(cur, doc)) return "sama";
    if (!OW) { skipped.push(coll + "/" + doc._id); return "dilewati"; }
    upsert(coll, doc); return "diperbarui";
  }
  function sameScript(a, b) { return a.script === b.script; }
  function samePreset(a, b) { return JSON.stringify(canon(a)) === JSON.stringify(canon(b)); }
  function report(label, items, coll, same) {
    var res = {};
    items.forEach(function (d) { var st = put(coll, d, same); (res[st] = res[st] || []).push(d._id); });
    Object.keys(res).forEach(function (st) {
      say(label + " " + st + ": " + res[st].length + (st === "baru" || st === "diperbarui" || st === "dilewati" ? " (" + res[st].join(", ") + ")" : ""));
    });
  }
  function insertIfAbsent(doc) {
    if (db.config.findOne({_id: doc._id})) return false;
    if (!dry) db.config.insertOne(doc);
    return true;
  }

  if (B.vp) report("Virtual Parameters", B.vp, "virtualParameters", sameScript);
  if (B.prov && B.prov.length) report("Provisions", B.prov, "provisions", sameScript);
  if (B.ui) {
    var old = db.config.countDocuments ? db.config.countDocuments({_id: /^ui\./}) : db.config.count({_id: /^ui\./});
    if (!dry) {
      db.config.deleteMany({_id: /^ui\./});
      db.config.insertMany(B.ui, {ordered: false});
    }
    say("Config ui.*: " + old + " key lama diganti " + B.ui.length + " key baru");
    var n = 0;
    (B.branding || []).forEach(function (d) { if (insertIfAbsent(d)) n++; });
    say("Config branding.*: " + n + " key ditambahkan (yang sudah ada tidak diubah)");
  }
  if (B.bot) {
    var m = 0;
    B.bot.forEach(function (d) { if (insertIfAbsent(d)) m++; });
    say("Config bot.*: " + m + " key contoh ditambahkan (isi token & chat ID di Admin -> Config)");
  }
  if (B.baselinePresets) report("Preset dasar (aman, tidak ubah ONT)", B.baselinePresets, "presets", samePreset);
  if (B.presets) {
    report("Preset yang mengubah ONT", B.presets, "presets", samePreset);
    say("  -> " + B.presets.map(function (p) { return p._id + " -> " + p.configurations[0].name; }).join(", "));
  }
  if (skipped.length) {
    say("!! DILEWATI (sudah ada di server dan berbeda; TIDAK ditimpa): " + skipped.join(", "));
    say("   Itu sengaja: menimpa provision/preset yang sedang berjalan bisa mengubah semua ONT. Kalau memang mau diganti: --overwrite (backup tetap dibuat).");
  }
  if (!dry) db.cache.deleteMany({_id: {$in: ["ui-local-cache-hash", "cwmp-local-cache-hash"]}});
  say("Cache GenieACS dibersihkan");
})();
