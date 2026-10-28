// Tambah menu di sidebar Admin GenieACS yang membuka halaman lain (iframe, host sama, port berbeda):
//   "🤖 Bot"  -> halaman bot WA (default port 3010)
//   "🗺 Peta" + "📡 ODP" -> /peta.html di GenieACS sendiri (port yang sama, tanpa service lain; lihat docs/MAP.md)
//   "🤖 Bot" (native) -> /bot.html: pengaturan bot Telegram/AI/WA di Admin -> Config (tanpa port lain)
//   "📱 Bot WA" -> /wa.html: status & QR bot WhatsApp lewat Config (port GenieACS, tanpa port 3010)
//   Tema gelap/terang: tombol di pojok kanan bawah, pilihan diingat per browser
// Pakai: node ui-admin-menu.js <file app-*.js asli> <file keluaran> <portBot|0> [peta|0] [botpage|0] [tema|0] [wapage|0]
// portBot 0 = tanpa menu Bot (iframe port); argumen ke-4..6 selain 0/kosong = pasang Peta&ODP / halaman Bot / tema.
// Diuji pada GenieACS 1.2.13 (app-FOJWPRV7.js). Setiap titik sisip harus ditemukan TEPAT SEKALI,
// kalau tidak (versi GenieACS lain) script berhenti tanpa menulis apa pun.
"use strict";
const fs = require("fs");
const [src, out, portArg, mapArg, botPageArg, themeArg, waPageArg] = process.argv.slice(2);
const withWaPage = !!(parseInt(waPageArg, 10) || 0);
const withBotPage = !!(parseInt(botPageArg, 10) || 0);
const withTheme = !!(parseInt(themeArg, 10) || 0);
const port = portArg === undefined ? 3010 : parseInt(portArg, 10) || 0;
const withMap = !!(parseInt(mapArg, 10) || 0);
if (!port && !withMap && !withBotPage && !withTheme && !withWaPage) { console.error("tidak ada menu yang diminta"); process.exit(1); }
const pages = [];     // key halaman
const items = [];     // <li> sidebar
const routes = [];    // rute
const frame = (src) => '(0,jt.default)("iframe",{src:' + src + ',allow:"geolocation",' +
  'style:"width:100%;height:calc(100vh - 170px);min-height:480px;border:0;background:#fff"})';
const hostPort = (p) => 'location.protocol+"//"+location.hostname+":' + p + '/"';
function menu(key, label, title, src) {
  pages.push(key);
  items.push('window.authorizer.hasAccess("config",2)&&n.push((0,je.default)("li",{class:t.' + key + '},(0,je.default)("a",{href:"#!/admin/' + key + '"},"' + label + '"))),');
  routes.push('"/admin/' + key + '":nt("' + key + '",{component:()=>({view:()=>(document.title="' + title + ' - GenieACS",' + frame(src) + ')})}),');
}
if (port) menu("bot", "🤖 Bot", "Bot", hostPort(port));
// item sidebar "Tema" (bukan halaman): hanya mengganti tema; tombol melayang tetap ada untuk semua halaman
if (withTheme) items.push('window.authorizer.hasAccess("config",2)&&n.push((0,je.default)("li",(0,je.default)("a",{href:"#",onclick:function(e){e.preventDefault();window.acsToggleTheme&&window.acsToggleTheme()}},"\\u{1F319}/\\u2600 Tema"))),');
if (withWaPage) menu("wa", "📱 Bot WA", "Bot WA", '"/wa.html"');
if (withBotPage) menu("botcfg", "\u{1F916} Bot", "Bot", '"/bot.html"');
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
// Tema gelap: filter invert pada <html> (menutup seluruh UI GenieACS tanpa menyentuh CSS-nya); iframe (halaman
// peta/bot) dikembalikan normal dan mengikuti class "acs-dark" di <html> induk dengan CSS sendiri.
const THEME = ';(function(){var K="acs_theme",d=document,h=d.documentElement;function g(){try{return localStorage.getItem(K)==="dark"}catch(e){return false}}' +
  'function ap(){h.classList.toggle("acs-dark",g());var b=d.getElementById("acs-theme-btn");if(b)b.textContent=g()?"\u2600 Terang":"\u{1F319} Gelap"}' +
  'var s=d.createElement("style");s.textContent="html.acs-dark{filter:invert(1) hue-rotate(180deg);background:#e2e2e2}html.acs-dark iframe{filter:invert(1) hue-rotate(180deg)}' +
  '#acs-theme-btn{position:fixed;right:16px;bottom:16px;z-index:99999;font:600 14px sans-serif;padding:10px 16px;border:2px solid #2563eb;border-radius:22px;background:#fff;color:#1e3a8a;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35)}#acs-theme-btn:hover{background:#dbeafe}";' +
  '(d.head||h).appendChild(s);function mk(){if(d.getElementById("acs-theme-btn"))return;var b=d.createElement("button");b.id="acs-theme-btn";b.type="button";' +
  'window.acsToggleTheme=function(){try{localStorage.setItem(K,g()?"light":"dark")}catch(e){}ap()};' +
  'b.onclick=window.acsToggleTheme;h.appendChild(b);ap()}' +
  // tombol di <html>, bukan <body>: Mithril (m.route(document.body)) mengosongkan body saat UI start
  'ap();mk();setInterval(mk,1500)})();' + "\n";
for (const [a, b] of patches) {
  const n = s.split(a).length - 1;
  if (n !== 1) { console.error("titik sisip ditemukan " + n + "x (harus 1): " + a.slice(0, 70) + "... -- versi GenieACS tidak didukung"); process.exit(3); }
  s = s.replace(a, () => b);
}
fs.writeFileSync(out, MARK + "\n" + (withTheme ? THEME : "") + s);
console.log("patch OK (bot:" + (port || "-") + " peta:" + (withMap ? "ya" : "-") + " botpage:" + (withBotPage ? "ya" : "-") + " tema:" + (withTheme ? "ya" : "-") + " wa:" + (withWaPage ? "ya" : "-") + ")");
