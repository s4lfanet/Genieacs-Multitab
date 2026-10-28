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
// item sidebar "Tema" (bukan halaman): membuka pemilih tema; tombol melayang tetap ada untuk semua halaman
if (withTheme) items.push('window.authorizer.hasAccess("config",2)&&n.push((0,je.default)("li",(0,je.default)("a",{href:"#",onclick:function(e){e.preventDefault();window.acsToggleTheme&&window.acsToggleTheme()}},"\\u{1F3A8} Tema"))),');
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
// Tema: seluruh UI GenieACS diwarnai lewat filter CSS pada <html> (tanpa menyentuh CSS aslinya):
//   - tema warna  = menimpa variabel CSS --color1..5 (dan warna #header) milik GenieACS
//   - tema gelap  = palet yang sama + filter invert + hue-rotate(180deg) pada <html>
// iframe (halaman peta/bot/wa) diberi filter yang sama sekali lagi (menetralkan) supaya tampil normal; untuk tema gelap halaman itu
// mengikuti class "acs-dark" di <html> induk dengan CSS gelapnya sendiri. Fungsi ini di-serialize apa adanya ke
// bundle, jadi harus berdiri sendiri (tidak boleh memakai variabel di luar fungsi).
function themeMain() {
  var K = "acs_theme", d = document, h = d.documentElement;
  // p = palet (variabel CSS --color1..5 milik GenieACS + warna header); null = bawaan. inv = tema gelap (filter).
  var T = [
    { id: "terang", n: "Terang", c: "#f2eddf", inv: 0, p: null },
    { id: "gelap", n: "Gelap", c: "#1d1d1d", inv: 1, p: null },
    { id: "laut", n: "Laut", c: "#bcd9f2", inv: 0, p: ["#cfe3f3", "#9db8cf", "#e6f0f8", "#0b5fa5", "#08305a", "#dbeaf6"] },
    { id: "hutan", n: "Hutan", c: "#c5e6bf", inv: 0, p: ["#cfe6c8", "#9fb89a", "#e7f2e3", "#1f7a3d", "#0d3b1c", "#dcefd6"] },
    { id: "senja", n: "Senja", c: "#d9c9f0", inv: 0, p: ["#ddd0f0", "#b3a3cc", "#eee7f8", "#6b3fa0", "#2d1650", "#e6dcf4"] },
    { id: "mawar", n: "Mawar", c: "#f3c6dc", inv: 0, p: ["#f3d0df", "#cfa0b6", "#f9e6ee", "#b02a63", "#5a0f31", "#f6dce8"] },
    { id: "gelap-laut", n: "Gelap Laut", c: "#14233a", inv: 1, p: ["#cfe3f3", "#9db8cf", "#e6f0f8", "#0b5fa5", "#08305a", "#dbeaf6"] },
    { id: "gelap-hutan", n: "Gelap Hutan", c: "#15291a", inv: 1, p: ["#cfe6c8", "#9fb89a", "#e7f2e3", "#1f7a3d", "#0d3b1c", "#dcefd6"] },
    { id: "gelap-senja", n: "Gelap Senja", c: "#241a38", inv: 1, p: ["#ddd0f0", "#b3a3cc", "#eee7f8", "#6b3fa0", "#2d1650", "#e6dcf4"] }
  ];
  function cur() {
    var v = null;
    try { v = localStorage.getItem(K); } catch (e) { /* storage diblokir */ }
    if (v === "dark") v = "gelap";
    for (var i = 0; i < T.length; i++) if (T[i].id === v) return T[i];
    return T[0];
  }
  var DARK = "invert(1) hue-rotate(180deg)";
  var css = "";
  T.forEach(function (t) {
    var r = 'html[data-acs-theme="' + t.id + '"]';
    if (t.p) {
      css += r + "{--color1:" + t.p[0] + ";--color2:" + t.p[1] + ";--color3:" + t.p[2] + ";--color4:" + t.p[3] + ";--color5:" + t.p[4] + "}";
      css += r + " #header{background-color:" + t.p[5] + "!important}";
    }
    if (t.inv) {
      css += r + "{filter:" + DARK + ";background:#e2e2e2}";
      css += r + " iframe," + r + " #acs-theme-btn," + r + " #acs-theme-panel{filter:" + DARK + "}";
      // irisan pie & kotak legend: netralkan filter gelap supaya warnanya persis seperti di Config/palet tema
      css += r + " .pie-chart>svg>path," + r + " .pie-chart .legend .color{filter:" + DARK + "}";
    }
  });
  css += "#acs-theme-btn{position:fixed;right:16px;bottom:16px;z-index:99999;font:600 14px sans-serif;padding:10px 16px;border:2px solid #2563eb;border-radius:22px;background:#fff;color:#1e3a8a;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35)}#acs-theme-btn:hover{background:#dbeafe}";
  css += "#acs-theme-panel{position:fixed;right:16px;bottom:64px;z-index:99999;display:none;width:210px;padding:8px;background:#fff;color:#1a1d21;border:1px solid #888;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.4);font:14px sans-serif}";
  css += "#acs-theme-panel button{display:flex;align-items:center;gap:10px;width:100%;margin:2px 0;padding:7px 8px;border:2px solid transparent;border-radius:8px;background:none;color:inherit;font:inherit;cursor:pointer;text-align:left}#acs-theme-panel button:hover{background:#eef2f7}#acs-theme-panel button.on{border-color:#2563eb;font-weight:600}";
  css += "#acs-theme-panel i{width:22px;height:22px;border-radius:50%;border:1px solid #888;flex:none}";
  var st = d.createElement("style");
  st.textContent = css;
  (d.head || h).appendChild(st);

  function apply() {
    var t = cur();
    h.setAttribute("data-acs-theme", t.id);
    h.classList.toggle("acs-dark", !!t.inv);
    if (window.acsRedraw) window.acsRedraw(); // grafik Overview dihitung ulang dengan warna tema baru
    var b = d.getElementById("acs-theme-btn");
    if (b) b.textContent = "\u{1F3A8} " + t.n;
    var p = d.getElementById("acs-theme-panel");
    if (p) for (var i = 0; i < p.children.length; i++) p.children[i].className = p.children[i].getAttribute("data-id") === t.id ? "on" : "";
  }
  // ---- warna grafik Overview (pie) mengikuti tema ----
  // GenieACS mengambil warna irisan/legend dari Config (ui.overview.charts.*.color). Kode grafik di bundle dipatch
  // supaya warnanya lewat window.acsChartColor. Warna semantik (merah/oranye/kuning: off, kritis, peringatan) dan
  // abu-abu dibiarkan; warna dingin (biru/hijau/ungu) diganti palet tema, berurutan per irisan. Terang/Gelap = asli.
  var CP = {
    laut: ["#0b5fa5", "#2b8fd9", "#6cb6ee", "#00a3a3", "#5b6fd6", "#9fc8ea"],
    hutan: ["#1f7a3d", "#4cae5f", "#8ed08b", "#0f8a7a", "#7bb33a", "#b9dd9a"],
    senja: ["#6b3fa0", "#9467c9", "#c0a2e6", "#4a52b3", "#a04fa6", "#d9c9f0"],
    mawar: ["#b02a63", "#d9568a", "#f08fb5", "#8c2f8a", "#c24fb0", "#f3c6dc"]
  };
  function hs(hex) {
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return null;
    var x = m[1].length === 3 ? m[1].replace(/./g, function (c) { return c + c; }) : m[1];
    var r = parseInt(x.substr(0, 2), 16) / 255, g = parseInt(x.substr(2, 2), 16) / 255, b = parseInt(x.substr(4, 2), 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn;
    if (dl < 0.08) return { h: 0, s: 0 };
    var h = mx === r ? ((g - b) / dl) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4;
    return { h: (h * 60 + 360) % 360, s: dl / (1 - Math.abs(mx + mn - 1) || 1) };
  }
  window.acsChartColor = function (color, idx) {
    var pal = CP[cur().id.replace(/^gelap-/, "")];
    if (!pal) return color;
    var c = hs(color);
    if (!c || c.s < 0.15) return color;
    if (c.h < 70 || c.h >= 335) return color;
    return pal[(idx || 0) % pal.length];
  };
  function pick(id) {
    try { localStorage.setItem(K, id); } catch (e) { /* abaikan */ }
    apply();
  }
  function panel() { return d.getElementById("acs-theme-panel"); }
  var openedAt = 0;
  window.acsToggleTheme = function () {
    var p = panel();
    if (!p) return;
    var show = p.style.display !== "block";
    p.style.display = show ? "block" : "none";
    if (show) openedAt = Date.now(); // klik yang membuka (mis. dari item sidebar) jangan langsung dihitung "klik di luar"
  };
  function mk() {
    if (d.getElementById("acs-theme-btn") && panel()) return;
    var old = d.getElementById("acs-theme-btn"); if (old) old.remove();
    var oldp = panel(); if (oldp) oldp.remove();
    var b = d.createElement("button");
    b.id = "acs-theme-btn"; b.type = "button"; b.onclick = window.acsToggleTheme;
    var p = d.createElement("div");
    p.id = "acs-theme-panel";
    T.forEach(function (t) {
      var o = d.createElement("button");
      o.type = "button"; o.setAttribute("data-id", t.id);
      var sw = d.createElement("i"); sw.style.background = t.c;
      var tx = d.createElement("span"); tx.textContent = t.n;
      o.appendChild(sw); o.appendChild(tx);
      o.onclick = function () { pick(t.id); p.style.display = "none"; };
      p.appendChild(o);
    });
    h.appendChild(p); h.appendChild(b);
    apply();
  }
  apply(); mk(); setInterval(mk, 1500); // tombol di <html>, bukan <body>: Mithril (m.route(document.body)) mengosongkan body
  d.addEventListener("click", function (e) {
    var p = panel();
    if (p && p.style.display === "block" && Date.now() - openedAt > 300 && !p.contains(e.target) && e.target.id !== "acs-theme-btn") p.style.display = "none";
  });
}
const THEME = ";(" + themeMain.toString() + ")();\n";

if (withTheme) {
  patches.push(
    // window.acsRedraw: dipakai tema untuk menggambar ulang grafik setelah ganti tema
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
fs.writeFileSync(out, MARK + "\n" + (withTheme ? THEME : "") + s);
console.log("patch OK (bot:" + (port || "-") + " peta:" + (withMap ? "ya" : "-") + " botpage:" + (withBotPage ? "ya" : "-") + " tema:" + (withTheme ? "ya" : "-") + " wa:" + (withWaPage ? "ya" : "-") + ")");
