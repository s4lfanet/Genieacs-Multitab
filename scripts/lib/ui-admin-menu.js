// Tambah menu di sidebar Admin GenieACS, dikelompokkan dengan ikon:
//   BOT       "Bot WA"        -> /wa.html   status & QR bot WhatsApp lewat Config (port GenieACS, tanpa port 3010)
//             "Bot"           -> /bot.html  pengaturan bot Telegram/AI/WA di Admin -> Config (tanpa port lain)
//             "Bot" (iframe)  -> halaman bot WA di port lain (opsi lama, default port 3010)
//   PELANGGAN "Peta", "ODP"   -> /peta.html di GenieACS sendiri (port yang sama, tanpa service lain; lihat docs/MAP.md)
//   TAMPILAN  "Tema"          -> pemilih tema (9 tema, terang & gelap); tombol melayang di pojok kanan bawah juga ada
// Pakai: node ui-admin-menu.js <file app-*.js asli> <file keluaran> <portBot|0> [peta|0] [botpage|0] [tema|0] [wapage|0]
// portBot 0 = tanpa menu Bot (iframe port); argumen ke-4..7 selain 0/kosong = pasang Peta&ODP / halaman Bot / tema / Bot WA.
// Kode tema ada di theme-runtime.js (dijalankan di browser, disisipkan apa adanya ke bundle).
// Diuji pada GenieACS 1.2.13 (app-FOJWPRV7.js). Setiap titik sisip harus ditemukan TEPAT SEKALI,
// kalau tidak (versi GenieACS lain) script berhenti tanpa menulis apa pun.
"use strict";
const fs = require("fs");
const path = require("path");
const [src, out, portArg, mapArg, botPageArg, themeArg, waPageArg] = process.argv.slice(2);
const withWaPage = !!(parseInt(waPageArg, 10) || 0);
const withBotPage = !!(parseInt(botPageArg, 10) || 0);
const withTheme = !!(parseInt(themeArg, 10) || 0);
const port = portArg === undefined ? 3010 : parseInt(portArg, 10) || 0;
const withMap = !!(parseInt(mapArg, 10) || 0);
if (!port && !withMap && !withBotPage && !withTheme && !withWaPage) { console.error("tidak ada menu yang diminta"); process.exit(1); }

const pages = [];     // key halaman (dianggap bagian Admin)
const items = [];     // potongan JS yang mendorong <li> ke sidebar
const routes = [];    // rute #!/admin/<key>
const frame = (src) => '(0,jt.default)("iframe",{src:' + src + ',allow:"geolocation",' +
  'style:"width:100%;height:calc(100vh - 170px);min-height:480px;border:0;background:transparent"})';
const hostPort = (p) => 'location.protocol+"//"+location.hostname+":' + p + '/"';
const guard = 'window.authorizer.hasAccess("config",2)&&n.push(';   // hanya user yang boleh mengubah Config
const sep = (label) => items.push(guard + '(0,je.default)("li.acs-sep","' + label + '")),');
// halaman (iframe): label tanpa emoji; ikon dari CSS (theme-runtime.js, class acs-x-<key>)
function menu(key, label, title, srcExpr) {
  pages.push(key);
  items.push(guard + '(0,je.default)("li",{class:t.' + key + '},(0,je.default)("a",{class:"acs-x acs-x-' + key + '",href:"#!/admin/' + key + '"},"' + label + '"))),');
  routes.push('"/admin/' + key + '":nt("' + key + '",{component:()=>({view:()=>(document.title="' + title + ' - GenieACS",' + frame(srcExpr) + ')})}),');
}
if (port || withWaPage || withBotPage) sep("Bot");
if (port) menu("bot", "Bot (port " + port + ")", "Bot", hostPort(port));
if (withWaPage) menu("wa", "Bot WA", "Bot WA", '"/wa.html"');
if (withBotPage) menu("botcfg", "Pengaturan Bot", "Pengaturan Bot", '"/bot.html"');
if (withMap) {
  sep("Pelanggan");
  menu("peta", "Peta", "Peta", '"/peta.html"');
  menu("odp", "ODP", "ODP", '"/peta.html#odp"');
}
if (withTheme) {
  // bukan halaman: membuka pemilih tema. Nama tema aktif ditampilkan di kanan (digambar ulang saat tema berganti)
  sep("Tampilan");
  items.push(guard + '(0,je.default)("li",(0,je.default)("a",{class:"acs-x acs-x-theme",href:"#",onclick:function(e){e.preventDefault();window.acsToggleTheme&&window.acsToggleTheme()}},"Tema",(0,je.default)("span.acs-v",window.acsThemeName?window.acsThemeName():"")))),');
}
const MARK = "/*GENIEACS-MULTITAB-BOT-MENU*/";

let s = fs.readFileSync(src, "utf8");
if (s.indexOf(MARK) >= 0) { console.error("file sumber sudah berisi patch -- pakai salinan asli"); process.exit(2); }

const patches = [
  // 1. halaman baru dianggap halaman Admin (tab Admin aktif + sidebar tampil)
  ['var Xl=["presets","provisions","virtualParameters","files","config","users","permissions"]',
   'var Xl=["presets","provisions","virtualParameters","files","config","users","permissions"' + pages.map((k) => "," + JSON.stringify(k)).join("") + "]"],
  // 2. item menu di sidebar
  ['(0,je.default)("nav#side-menu",(0,je.default)("ul",n))',
   items.join("") + '(0,je.default)("nav#side-menu",(0,je.default)("ul",n))'],
  // 3. rute #!/admin/<key>
  ['"/admin/permissions":nt("permissions",ri)', routes.join("") + '"/admin/permissions":nt("permissions",ri)']
];

if (withTheme) {
  patches.push(
    // window.acsRedraw: dipakai tema untuk menggambar ulang grafik/sidebar setelah ganti tema
    ['var Xl=[', 'window.acsRedraw=function(){try{jt.default.redraw()}catch(e){}};var Xl=['],
    // legend & irisan pie: warna lewat window.acsChartColor(warna asli, urutan irisan)
    ['{style:`background-color: ${G(g.color,null)} !important;`}',
     '{style:`background-color: ${window.acsChartColor?window.acsChartColor(G(g.color,null),Object.values(t).indexOf(g)):G(g.color,null)} !important;`}'],
    ['p("path",{d:m,fill:G(g.color,null)})',
     'p("path",{d:m,fill:window.acsChartColor?window.acsChartColor(G(g.color,null),Object.values(t).indexOf(g)):G(g.color,null)})']
  );
}
for (const [a, b] of patches) {
  const n = s.split(a).length - 1;
  if (n !== 1) { console.error("titik sisip ditemukan " + n + "x (harus 1): " + a.slice(0, 70) + "... -- versi GenieACS tidak didukung"); process.exit(3); }
  s = s.replace(a, () => b);
}
const THEME = withTheme ? fs.readFileSync(path.join(__dirname, "theme-runtime.js"), "utf8").replace(/\r/g, "") + "\n" : "";
fs.writeFileSync(out, MARK + "\n" + THEME + s);
console.log("patch OK (bot:" + (port || "-") + " peta:" + (withMap ? "ya" : "-") + " botpage:" + (withBotPage ? "ya" : "-") + " tema:" + (withTheme ? "ya" : "-") + " wa:" + (withWaPage ? "ya" : "-") + ")");
