// Tambah menu "🤖 Bot" di sidebar Admin GenieACS, membuka halaman bot WA (port 3010) di dalam iframe.
// Pakai: node ui-admin-menu.js <file app-*.js asli> <file keluaran> <port>
// Diuji pada GenieACS 1.2.13 (app-FOJWPRV7.js). Setiap titik sisip harus ditemukan TEPAT SEKALI,
// kalau tidak (versi GenieACS lain) script berhenti tanpa menulis apa pun.
"use strict";
const fs = require("fs");
const [src, out, portArg] = process.argv.slice(2);
const port = parseInt(portArg, 10) || 3010;
const MARK = "/*GENIEACS-MULTITAB-BOT-MENU*/";

let s = fs.readFileSync(src, "utf8");
if (s.indexOf(MARK) >= 0) { console.error("file sumber sudah berisi patch -- pakai salinan asli"); process.exit(2); }

const iframe = '(0,jt.default)("iframe",{src:location.protocol+"//"+location.hostname+":' + port + '/",' +
  'style:"width:100%;height:calc(100vh - 170px);min-height:480px;border:0;background:#fff"})';
const patches = [
  // 1. halaman "bot" dianggap halaman Admin (tab Admin aktif + sidebar tampil)
  ['var Xl=["presets","provisions","virtualParameters","files","config","users","permissions"]',
   'var Xl=["presets","provisions","virtualParameters","files","config","users","permissions","bot"]'],
  // 2. item menu di sidebar, hanya untuk user yang boleh mengubah Config
  ['(0,je.default)("nav#side-menu",(0,je.default)("ul",n))',
   'window.authorizer.hasAccess("config",2)&&n.push((0,je.default)("li",{class:t.bot},(0,je.default)("a",{href:"#!/admin/bot"},"\u{1F916} Bot"))),' +
   '(0,je.default)("nav#side-menu",(0,je.default)("ul",n))'],
  // 3. rute #!/admin/bot
  ['"/admin/permissions":nt("permissions",ri)',
   '"/admin/bot":nt("bot",{component:()=>({view:()=>(document.title="Bot - GenieACS",' + iframe + ')})}),' +
   '"/admin/permissions":nt("permissions",ri)']
];
for (const [a, b] of patches) {
  const n = s.split(a).length - 1;
  if (n !== 1) { console.error("titik sisip ditemukan " + n + "x (harus 1): " + a.slice(0, 70) + "... -- versi GenieACS tidak didukung"); process.exit(3); }
  s = s.replace(a, () => b);
}
fs.writeFileSync(out, MARK + "\n" + s);
console.log("patch OK (port " + port + ")");
