// Menyusun satu file JS untuk mongo/mongosh: data (BUNDLE) + logika import.
// Pakai: node bundle.js <root-repo> <output.js> ui=1 vp=1 prov=1 bot=0 presets=inform,useradmin provs=nokia_pppoe overwrite=0 dry=0
"use strict";
const fs = require("fs");
const path = require("path");

const [root, out, ...kv] = process.argv.slice(2);
const opt = Object.fromEntries(kv.map(s => s.split("=")));
const on = k => opt[k] === "1";
const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const scripts = dir => fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith(".js")).sort()
  .map(f => ({_id: f.slice(0, -3), script: fs.readFileSync(path.join(root, dir, f), "utf8")}));

// Provision yang MENGUBAH setelan ONT (URL ACS, kredensial, password web, firewall...). Isinya di repo berupa template
// dengan nilai contoh (GANTI_...), jadi TIDAK BOLEH ikut terpasang tanpa diminta: kalau server target sudah punya preset
// yang memakai provision bernama sama (mis. preset "inform" -> inform2), template ini langsung dijalankan ke semua ONT.
const MODIFY = ["connreq", "inform2", "useradmin2", "remoteweb", "nokia_pppoe"];
const PRESET_PROV = {connreq: "connreq", inform: "inform2", useradmin: "useradmin2", remoteweb: "remoteweb"};
const want = (opt.presets || "").split(",").filter(Boolean);
const wantProv = new Set((opt.provs || "").split(",").filter(Boolean));
want.forEach(p => { if (PRESET_PROV[p]) wantProv.add(PRESET_PROV[p]); });
for (const p of wantProv) if (!MODIFY.includes(p)) throw new Error("provision tidak dikenal untuk --provision: " + p);

const B = {dry: on("dry"), overwrite: on("overwrite")};
if (on("ui")) {
  const cfg = readJson("config/ui-config.json");
  B.ui = cfg.filter(d => d._id.startsWith("ui."));
  B.branding = cfg.filter(d => d._id.startsWith("branding."));
}
if (on("vp")) B.vp = scripts("virtual-parameters");
{
  // aman (hanya discovery + trigger VirtualParameters) = ikut kalau prov=1; yang mengubah ONT = hanya yang diminta
  B.prov = scripts("provisions").filter(d => MODIFY.includes(d._id) ? wantProv.has(d._id) : on("prov"));
}
if (on("prov")) {
  // bootstrap & default tidak mengubah setelan ONT (hanya discovery + trigger VirtualParameters),
  // jadi dipasang bersama provisions, tanpa perlu flag --preset-*. Tanpa preset ini, provision
  // bootstrap.js/default.js yang baru saja diimpor tidak akan pernah dipanggil oleh GenieACS.
  B.baselinePresets = readJson("presets/presets.json").filter(p => p._id === "bootstrap" || p._id === "default");
}
if (on("bot")) B.bot = readJson("config/bot-config.example.json");
if (want.length) {
  B.presets = readJson("presets/presets.json").filter(p => want.includes(p._id));
  for (const p of B.presets) {
    if (p.configurations[0].name !== PRESET_PROV[p._id]) throw new Error("preset " + p._id + " tidak sesuai");
  }
}

for (const d of [].concat(B.ui || [], B.branding || [], B.bot || [])) {
  if (typeof d.value !== "string") throw new Error("nilai config harus string: " + d._id);
}

const logic = fs.readFileSync(path.join(__dirname, "import.js"), "utf8");
fs.writeFileSync(out, "var BUNDLE = " + JSON.stringify(B) + ";\n" + logic);
