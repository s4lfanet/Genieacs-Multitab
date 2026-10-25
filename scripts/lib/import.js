// Logika import (dijalankan di mongo/mongosh). BUNDLE didefinisikan oleh bundle.js.
// ES5 supaya jalan di mongo shell lama maupun mongosh.
(function () {
  var B = BUNDLE, dry = B.dry;
  function say(s) { print((dry ? "[dry-run] " : "") + s); }
  function upsert(coll, doc) { if (!dry) db.getCollection(coll).replaceOne({_id: doc._id}, doc, {upsert: true}); }
  function insertIfAbsent(doc) {
    if (db.config.findOne({_id: doc._id})) return false;
    if (!dry) db.config.insertOne(doc);
    return true;
  }

  if (B.vp) {
    B.vp.forEach(function (d) { upsert("virtualParameters", d); });
    say("Virtual Parameters dipasang/diperbarui: " + B.vp.length);
  }
  if (B.prov) {
    B.prov.forEach(function (d) { upsert("provisions", d); });
    say("Provisions dipasang/diperbarui: " + B.prov.map(function (d) { return d._id; }).join(", "));
  }
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
  if (B.baselinePresets) {
    B.baselinePresets.forEach(function (p) { upsert("presets", p); });
    say("Preset dasar (aman, tidak ubah ONT) dipasang: " + B.baselinePresets.map(function (p) { return p._id; }).join(", "));
  }
  if (B.presets) {
    B.presets.forEach(function (p) { upsert("presets", p); });
    say("Preset dipasang: " + B.presets.map(function (p) { return p._id + " -> " + p.configurations[0].name; }).join(", "));
  }
  if (!dry) db.cache.deleteMany({_id: {$in: ["ui-local-cache-hash", "cwmp-local-cache-hash"]}});
  say("Cache GenieACS dibersihkan");
})();
