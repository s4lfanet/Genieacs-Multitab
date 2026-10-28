// Tambah menu di sidebar Admin GenieACS yang membuka halaman lain (iframe, host sama, port berbeda):
//   "🤖 Bot"  -> halaman bot WA (default port 3010)
//   "🗺 Peta" + "📡 ODP" -> /peta.html di GenieACS sendiri (port yang sama, tanpa service lain; lihat docs/MAP.md)
// Pakai: node ui-admin-menu.js <file app-*.js asli> <file keluaran> <portBot|0> [peta|0]
// portBot 0 = tanpa menu Bot; argumen ke-4 selain 0/kosong = pasang menu Peta & ODP.
// Diuji pada GenieACS 1.2.13 (app-FOJWPRV7.js). Setiap titik sisip harus ditemukan TEPAT SEKALI,
// kalau tidak (versi GenieACS lain) script berhenti tanpa menulis apa pun.
"use strict";
const fs = require("fs");
const [src, out, portArg, mapArg] = process.argv.slice(2);
const port = portArg === undefined ? 3010 : parseInt(portArg, 10) || 0;
const withMap = !!(parseInt(mapArg, 10) || 0);
if (!port && !withMap) { console.error("tidak ada menu yang diminta"); process.exit(1); }
const pages = [];     // key halaman
const items = [];     // <li> sidebar
const routes = [];    // rute
const frame = (src) => '(0,jt.default)("iframe",{src:' + src + ',' +
  'style:"width:100%;height:calc(100vh - 170px);min-height:480px;border:0;background:#fff"})';
const hostPort = (p) => 'location.protocol+"//"+location.hostname+":' + p + '/"';
function menu(key, label, title, src) {
  pages.push(key);
  items.push('window.authorizer.hasAccess("config",2)&&n.push((0,je.default)("li",{class:t.' + key + '},(0,je.default)("a",{href:"#!/admin/' + key + '"},"' + label + '"))),');
  routes.push('"/admin/' + key + '":nt("' + key + '",{component:()=>({view:()=>(document.title="' + title + ' - GenieACS",' + frame(src) + ')})}),');
}
if (port) menu("bot", "🤖 Bot", "Bot", hostPort(port));
if (withMap) {
  menu("peta", "🗺 Peta", "Peta", '"/peta.html"');
  menu("odp", "📡 ODP", "ODP", '"/peta.html#odp"');
}
const MARK = "/*GENIEACS-MULTITAB-BOT-MENU*/";

let s = fs.readFileSync(src, "utf8");
if (s.indexOf(MARK) >= 0) { console.error("file sumber sudah berisi patch -- pakai salinan asli"); process.exit(2); }

const patches = [
  // 1. halaman baru dianggap halaman Admin (tab Admin aktif + sidebar tampil)
  ['var Xl=["presets","provisions","virtualParameters","files","config","users","permissions"]',
   'var Xl=["presets","provisions","virtualParameters","files","config","users","permissions",' + pages.map((k) => JSON.stringify(k)).join(",") + "]"],
  // 2. item menu di sidebar, hanya untuk user yang boleh mengubah Config
  ['(0,je.default)("nav#side-menu",(0,je.default)("ul",n))',
   items.join("") + '(0,je.default)("nav#side-menu",(0,je.default)("ul",n))'],
  // 3. rute #!/admin/<key>
  ['"/admin/permissions":nt("permissions",ri)', routes.join("") + '"/admin/permissions":nt("permissions",ri)']
];
for (const [a, b] of patches) {
  const n = s.split(a).length - 1;
  if (n !== 1) { console.error("titik sisip ditemukan " + n + "x (harus 1): " + a.slice(0, 70) + "... -- versi GenieACS tidak didukung"); process.exit(3); }
  s = s.replace(a, () => b);
}
fs.writeFileSync(out, MARK + "\n" + s);
console.log("patch OK (bot:" + (port || "-") + " peta:" + (withMap ? "ya" : "-") + ")");
