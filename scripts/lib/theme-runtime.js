// Runtime tema untuk UI GenieACS. Dijalankan di BROWSER: ui-admin-menu.js menyisipkan file ini apa adanya ke awal
// bundle app-*.js. Harus berdiri sendiri (tidak memakai variabel lain di bundle).
//
// Cara kerja: tiap tema = satu set token warna. Token dipetakan ke variabel CSS bawaan GenieACS (--color1..5)
// ditambah penimpaan semua aturan yang memakai warna tetap (#fff, #ffffffe6, beige di ikon tag, pastel notifikasi,
// CodeMirror, tab multi-tab, ...). Tidak ada filter invert; tema gelap memakai color-scheme: dark sehingga
// kontrol bawaan browser (dropdown, scrollbar) ikut gelap. Variabel --acs-* dipakai halaman Peta/Bot/WA di iframe.
;(function () {
  "use strict";
  var K = "acs_theme", d = document, h = d.documentElement;

  // c = [--color1 (border/tab), --color2, --color3 (latar kontrol & sidebar), --color4 (aksen), --color5 (teks)]
  // bg = latar halaman, sf = permukaan (laci/popup), hd = latar header, mu = teks redup, cp = palet grafik (pie)
  var T = [
    { id: "terang", n: "Terang", dark: 0, bg: "#ffffff", sf: "#ffffff", hd: "#f2eddf", mu: "#666666",
      c: ["#ebe0bf", "#b9b098", "#f2ebd5", "#046380", "#002f2f"], cp: null },
    { id: "laut", n: "Laut", dark: 0, bg: "#fbfdff", sf: "#ffffff", hd: "#dbeaf6", mu: "#5b6b7b",
      c: ["#cfe3f3", "#9db8cf", "#e6f0f8", "#0b5fa5", "#08305a"], cp: ["#0b5fa5", "#2b8fd9", "#6cb6ee", "#00a3a3", "#5b6fd6", "#9fc8ea"] },
    { id: "hutan", n: "Hutan", dark: 0, bg: "#fcfefb", sf: "#ffffff", hd: "#dcefd6", mu: "#5a6b5c",
      c: ["#cfe6c8", "#9fb89a", "#e7f2e3", "#1f7a3d", "#0d3b1c"], cp: ["#1f7a3d", "#4cae5f", "#8ed08b", "#0f8a7a", "#7bb33a", "#b9dd9a"] },
    { id: "senja", n: "Senja", dark: 0, bg: "#fdfcff", sf: "#ffffff", hd: "#e6dcf4", mu: "#6a6078",
      c: ["#ddd0f0", "#b3a3cc", "#eee7f8", "#6b3fa0", "#2d1650"], cp: ["#6b3fa0", "#9467c9", "#c0a2e6", "#4a52b3", "#a04fa6", "#d9c9f0"] },
    { id: "mawar", n: "Mawar", dark: 0, bg: "#fffcfd", sf: "#ffffff", hd: "#f6dce8", mu: "#7a6070",
      c: ["#f3d0df", "#cfa0b6", "#f9e6ee", "#b02a63", "#5a0f31"], cp: ["#b02a63", "#d9568a", "#f08fb5", "#8c2f8a", "#c24fb0", "#f3c6dc"] },
    { id: "gelap", n: "Gelap", dark: 1, bg: "#16181b", sf: "#1f2328", hd: "#1b1e22", mu: "#9aa3ad",
      c: ["#343a42", "#4a525c", "#242830", "#6fb9d8", "#e4e7ea"], cp: null },
    { id: "gelap-laut", n: "Gelap Laut", dark: 1, bg: "#0f1620", sf: "#162030", hd: "#121c2a", mu: "#8fa3b8",
      c: ["#27364a", "#3b4f68", "#1a2535", "#6cb6ee", "#e3ebf5"], cp: ["#6cb6ee", "#4a9fe0", "#2b7fc4", "#5fd0d0", "#8a9cf0", "#a7cdf0"] },
    { id: "gelap-hutan", n: "Gelap Hutan", dark: 1, bg: "#101612", sf: "#18221b", hd: "#131b15", mu: "#93a897",
      c: ["#2a3a2d", "#3f5643", "#1b251d", "#7fd18a", "#e5efe6"], cp: ["#7fd18a", "#4cae5f", "#2f8f47", "#5fd0b8", "#a6d65f", "#b9dd9a"] },
    { id: "gelap-senja", n: "Gelap Senja", dark: 1, bg: "#14111b", sf: "#1d1927", hd: "#181421", mu: "#a198b3",
      c: ["#342c45", "#4d4262", "#221d2d", "#b79af0", "#ebe6f5"], cp: ["#b79af0", "#9467c9", "#7a4cb4", "#8a9cf0", "#d086cc", "#d9c9f0"] }
  ];

  function cur() {
    var v = null;
    try { v = localStorage.getItem(K); } catch (e) { /* storage diblokir */ }
    if (v === "dark") v = "gelap"; // nilai lama
    for (var i = 0; i < T.length; i++) if (T[i].id === v) return T[i];
    return T[0];
  }

  // ---------- ikon sidebar (mask SVG, warna mengikuti teks) ----------
  function ico(inner) {
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>" + inner + "</svg>";
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  }
  var ICON = {
    wa: ico("<path d='M21 11.5a8.4 8.4 0 0 1-12.2 7.5L3 20.5l1.6-5.3A8.4 8.4 0 1 1 21 11.5z'/><path d='M9 11.5h.01M12 11.5h.01M15 11.5h.01'/>"),
    botcfg: ico("<rect x='4' y='8' width='16' height='11' rx='3'/><path d='M12 8V5M9 13h.01M15 13h.01M9.5 16.5h5'/><circle cx='12' cy='4' r='1'/>"),
    bot: ico("<rect x='4' y='8' width='16' height='11' rx='3'/><path d='M12 8V5M9 13h.01M15 13h.01M9.5 16.5h5'/><circle cx='12' cy='4' r='1'/>"),
    peta: ico("<path d='M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z'/><circle cx='12' cy='9.5' r='2.5'/>"),
    odp: ico("<circle cx='12' cy='5' r='2'/><circle cx='5' cy='19' r='2'/><circle cx='12' cy='19' r='2'/><circle cx='19' cy='19' r='2'/><path d='M12 7v5M12 12l-6 5M12 12v5M12 12l6 5'/>"),
    status: ico("<path d='M3 12h4l3-8 4 16 3-8h4'/>"),
    update: ico("<path d='M12 3v12M7 10l5 5 5-5'/><path d='M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2'/>"),
    theme: ico("<path d='M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.6-2.1-.5-1.3.4-2.4 1.8-2.4H17a4 4 0 0 0 4-4C21 6.7 17 3 12 3z'/><circle cx='7.5' cy='11' r='1'/><circle cx='10.5' cy='7' r='1'/><circle cx='15.5' cy='7.5' r='1'/>")
  };

  // ---------- CSS ----------
  function tagSvg(fill) {
    var s = "<svg xmlns='http://www.w3.org/2000/svg' width='190' height='16'><path d='M6.59 15.42l-6-6a2 2 0 0 1 0-2.83l6-6A2 2 0 0 1 8 0h180a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-1.41-.58zM4.35 6.59A2 2 0 1 0 7.17 9.4 2 2 0 0 0 4.35 6.6z' fill='" + fill + "'/></svg>";
    return 'url("data:image/svg+xml,' + encodeURIComponent(s) + '")';
  }

  function tokens(t) {
    var dk = !!t.dark;
    return "--color1:" + t.c[0] + ";--color2:" + t.c[1] + ";--color3:" + t.c[2] + ";--color4:" + t.c[3] + ";--color5:" + t.c[4] +
      ";--disabled:" + t.mu + ";--acs-bg:" + t.bg + ";--acs-surface:" + t.sf + ";--acs-text:" + t.c[4] + ";--acs-muted:" + t.mu +
      ";--acs-border:" + t.c[0] + ";--acs-accent:" + t.c[3] + ";--acs-soft:" + t.c[2] + ";--acs-header:" + t.hd +
      ";--acs-on-accent:" + (dk ? t.bg : "#ffffff") + ";--acs-ok:" + (dk ? "#5fd08a" : "#16803c") + ";--acs-bad:" + (dk ? "#ff8a8a" : "#c62828") +
      ";--acs-warn:" + (dk ? "#f0b95b" : "#b45309") + ";color-scheme:" + (dk ? "dark" : "light") +
      (dk ? ";--status-red:0 50% 30%;--status-green:125 35% 24%;--status-gray:0 0% 30%;--status-yellow:46 55% 26%" : "");
  }

  function themeCss(t) {
    var R = 'html[data-acs-theme="' + t.id + '"]', v = t.c, dk = !!t.dark;
    var sh = dk ? "rgba(0,0,0,.65)" : "#ccc", errfg = dk ? "#ff8a8a" : "#a00", errbg = dk ? "#4a2226" : "#efcbcf", errbd = dk ? "#7a3a40" : "#e6b2b7";
    var a = R + "{" + tokens(t) + ";background:" + t.bg + "}";
    // header + logo
    a += R + " #header{background-color:" + t.hd + "!important}";
    a += R + " #header>.logo::after," + R + " #header>.logo>.version::after{color:" + v[4] + "!important}";
    a += R + " #header>.logo>.version{color:" + t.mu + "}";
    if (dk) a += R + " #header>.logo>img{filter:invert(1) hue-rotate(180deg)}";
    a += R + " #header>nav>ul>li:is(.active,:hover){background-color:" + t.bg + "}";
    // laci edit, notifikasi, popup, autocomplete
    a += R + " #header>.drawer-wrapper>.drawer," + R + " #header>.drawer-wrapper>.notifications-wrapper>.notification{background-color:" + t.sf + "f2;box-shadow:0 6px 20px " + sh + "}";
    a += R + " .overlay-wrapper>.overlay{background-color:" + t.sf + ";box-shadow:0 0 15px " + sh + "}";
    a += R + " .autocomplete{background-color:" + t.sf + ";box-shadow:0 0 10px " + sh + "}";
    a += R + " .wizard-dialog{box-shadow:0 0 10px " + sh + "}";
    a += R + " a:hover{color:" + (dk ? t.bg : "#fff") + ";background-color:" + v[3] + "}";
    // error / kritis / progres / placeholder / label
    a += R + " p.error," + R + " :is(input[type=button],button).critical{color:" + errfg + "}";
    a += R + " :is(.CodeMirror,textarea,select,input).error{background-color:" + errbg + ";border-color:" + errbd + "}";
    a += R + " .progress{background-color:" + v[0] + "}";
    a += R + " span.parameter-value>span:empty:before{color:" + t.mu + "}";
    a += R + " input::placeholder," + R + " textarea::placeholder{color:" + t.mu + ";opacity:1}";
    a += R + " .pie-chart>svg>a>text{fill:" + v[4] + "}";
    a += R + " span.tag{background-image:" + tagSvg(dk ? v[0] : v[0]) + "}";
    // CodeMirror (editor script provision/VP)
    a += R + " .CodeMirror{background:" + v[2] + ";color:" + v[4] + "}";
    a += R + " .CodeMirror-gutters{background-color:" + v[2] + ";border-right-color:" + v[0] + "}";
    a += R + " .CodeMirror-linenumber{color:" + t.mu + "}";
    a += R + " .CodeMirror-cursor{border-left-color:" + v[4] + "}";
    a += R + " .CodeMirror-activeline-background{background:" + v[0] + "}";
    a += R + " .CodeMirror-scrollbar-filler," + R + " .CodeMirror-gutter-filler{background-color:" + v[2] + "}";
    a += R + " .CodeMirror-selected," + R + " .CodeMirror-focused .CodeMirror-selected{background:" + v[3] + "44}";
    if (dk) {
      a += R + " mark{background:#7a6200;color:#fff}";
      a += R + " .cm-s-default .cm-keyword{color:#c792ea}" + R + " .cm-s-default .cm-atom," + R + " .cm-s-default .cm-number{color:#f78c6c}" +
        R + " .cm-s-default .cm-def," + R + " .cm-s-default .cm-builtin{color:#82aaff}" + R + " .cm-s-default .cm-variable-2{color:#89ddff}" +
        R + " .cm-s-default .cm-variable-3," + R + " .cm-s-default .cm-type{color:#c3e88d}" + R + " .cm-s-default .cm-comment{color:#7f8c98}" +
        R + " .cm-s-default .cm-string{color:#ecc48d}" + R + " .cm-s-default .cm-string-2{color:#f78c6c}" + R + " .cm-s-default .cm-meta," +
        R + " .cm-s-default .cm-qualifier{color:#a6accd}" + R + " .cm-s-default .cm-bracket{color:#ffcb6b}" + R + " .cm-s-default .cm-tag{color:#f07178}" +
        R + " .cm-s-default .cm-attribute{color:#ffcb6b}" + R + " .cm-s-default .cm-link," + R + " .cm-s-default .cm-header{color:#82aaff}";
    }
    // tab multi-tab (CSS dari Config ui.device.0 memakai warna tetap)
    a += R + " .acs-bar{border-bottom-color:" + v[3] + "}";
    a += R + " .acs-l{background:" + v[2] + ";color:" + v[4] + ";border-color:" + v[0] + "}";
    a += R + " .acs-l:hover{background:" + v[0] + "}";
    a += R + " .acs-bar .acs-l1{background:" + v[3] + ";color:" + (dk ? t.bg : "#fff") + ";border-color:" + v[3] + "}";
    a += R + " .acs-bar:has(.acs-r:checked) .acs-l1{background:" + v[2] + ";color:" + v[4] + ";border-color:" + v[0] + "}";
    a += R + " .acs-bar .acs-r:checked+label.acs-l{background:" + v[3] + ";color:" + (dk ? t.bg : "#fff") + ";border-color:" + v[3] + "}";
    return a;
  }

  var css = "html{" + tokens(T[0]).replace(/;color-scheme:light/, "") + "}";
  T.forEach(function (t, i) { css += i === 0 ? "" : themeCss(t); });

  // sidebar Admin: grup "Alat Tambahan" (item ditambahkan oleh patch bundle)
  css += "#side-menu>ul>li.acs-sep{margin:18px 0 4px;padding:0 6px 0 2px;font:700 10px/1.2 system-ui,sans-serif;letter-spacing:.09em;text-transform:uppercase;color:var(--color4);opacity:.8}";
  css += "#side-menu>ul>li>a.acs-x{display:flex;align-items:center;gap:10px;margin:2px 8px 2px 0;padding:8px 10px;border:1px solid transparent;border-radius:9px;background:transparent;color:var(--color5);font-weight:600;line-height:18px}";
  css += "#side-menu>ul>li>a.acs-x::before{content:'';flex:none;width:18px;height:18px;background:currentColor;-webkit-mask:var(--ico) center/contain no-repeat;mask:var(--ico) center/contain no-repeat;opacity:.9}";
  css += "#side-menu>ul>li>a.acs-x:hover{background:var(--color3);color:var(--color4);border-color:var(--color1)}";
  css += "#side-menu>ul>li.active>a.acs-x{background:var(--color4);color:var(--acs-on-accent);border-color:var(--color4)}";
  css += "#side-menu>ul>li>a.acs-x>.acs-v{margin-left:auto;font-size:11px;font-weight:600;opacity:.7}";
  Object.keys(ICON).forEach(function (k) { css += "#side-menu>ul>li>a.acs-x-" + k + "{--ico:" + ICON[k] + "}"; });

  // tombol & pemilih tema
  css += "#acs-theme-btn{position:fixed;right:16px;bottom:16px;z-index:99999;display:flex;align-items:center;gap:8px;padding:8px 14px 8px 10px;border:1px solid var(--acs-border);border-radius:999px;background:var(--acs-surface);color:var(--acs-text);font:600 13px system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25)}";
  css += "#acs-theme-btn:hover{border-color:var(--acs-accent)}#acs-theme-btn i{width:14px;height:14px;border-radius:50%;background:var(--acs-accent);box-shadow:inset 0 0 0 2px var(--acs-header)}";
  css += "#acs-theme-panel{position:fixed;right:16px;bottom:62px;z-index:99999;display:none;width:300px;max-width:calc(100vw - 32px);padding:12px 12px 4px;background:var(--acs-surface);color:var(--acs-text);border:1px solid var(--acs-border);border-radius:16px;box-shadow:0 14px 36px rgba(0,0,0,.32);font:13px system-ui,sans-serif}";
  css += "#acs-theme-panel h4{margin:2px 2px 8px;font:700 10px/1.2 system-ui,sans-serif;letter-spacing:.09em;text-transform:uppercase;color:var(--acs-muted)}";
  css += "#acs-theme-panel .g{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}";
  css += "#acs-theme-panel .o{display:block;padding:5px;border:2px solid transparent;border-radius:11px;background:none;color:inherit;font:inherit;cursor:pointer;text-align:center}";
  css += "#acs-theme-panel .o:hover{background:var(--acs-soft)}#acs-theme-panel .o.on{border-color:var(--acs-accent)}";
  css += "#acs-theme-panel .pv{display:block;position:relative;height:38px;margin-bottom:4px;border:1px solid rgba(128,128,128,.45);border-radius:7px;overflow:hidden}";
  css += "#acs-theme-panel .pv b{position:absolute;left:0;right:0;top:0;height:11px}#acs-theme-panel .pv u{position:absolute;left:6px;right:6px;bottom:6px;height:6px;border-radius:3px;text-decoration:none}";
  css += "#acs-theme-panel .nm{font-size:11.5px;font-weight:600;line-height:1.2}";

  var st = d.createElement("style");
  st.id = "acs-theme-css";
  st.textContent = css;
  (d.head || h).appendChild(st);

  // ---------- penerapan ----------
  function btn() { return d.getElementById("acs-theme-btn"); }
  function panel() { return d.getElementById("acs-theme-panel"); }
  function apply() {
    var t = cur();
    h.setAttribute("data-acs-theme", t.id);
    h.classList.toggle("acs-dark", !!t.dark);
    var b = btn();
    if (b) b.lastChild.textContent = t.n;
    var p = panel();
    if (p) { var o = p.querySelectorAll(".o"); for (var i = 0; i < o.length; i++) o[i].className = "o" + (o[i].getAttribute("data-id") === t.id ? " on" : ""); }
    if (window.acsRedraw) window.acsRedraw(); // grafik Overview + nama tema di sidebar digambar ulang
  }
  function pick(id) {
    try { localStorage.setItem(K, id); } catch (e) { /* abaikan */ }
    apply();
  }
  var openedAt = 0;
  window.acsToggleTheme = function () {
    var p = panel();
    if (!p) return;
    var show = p.style.display !== "block";
    p.style.display = show ? "block" : "none";
    if (show) openedAt = Date.now(); // klik pembuka (mis. dari sidebar) jangan dihitung "klik di luar"
  };
  window.acsThemeName = function () { return cur().n; };

  // ---------- warna grafik Overview ----------
  // GenieACS mengambil warna irisan/legend dari Config (ui.overview.charts.*.color). Kode grafik di bundle dipatch agar
  // lewat fungsi ini. Warna semantik (merah/oranye/kuning) dan abu-abu dibiarkan; warna dingin diganti palet tema.
  function hs(hex) {
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return null;
    var x = m[1].length === 3 ? m[1].replace(/./g, function (c) { return c + c; }) : m[1];
    var r = parseInt(x.substr(0, 2), 16) / 255, g = parseInt(x.substr(2, 2), 16) / 255, b = parseInt(x.substr(4, 2), 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn;
    if (dl < 0.08) return { h: 0, s: 0 };
    var hh = mx === r ? ((g - b) / dl) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4;
    return { h: (hh * 60 + 360) % 360, s: dl / (1 - Math.abs(mx + mn - 1) || 1) };
  }
  window.acsChartColor = function (color, idx) {
    var pal = cur().cp;
    if (!pal) return color;
    var c = hs(color);
    if (!c || c.s < 0.15) return color;
    if (c.h < 70 || c.h >= 335) return color;
    return pal[(idx || 0) % pal.length];
  };

  // ---------- elemen melayang ----------
  function sw(t) {
    var o = d.createElement("button");
    o.type = "button"; o.className = "o"; o.setAttribute("data-id", t.id); o.title = t.n;
    var pv = d.createElement("span"); pv.className = "pv"; pv.style.background = t.bg;
    var hb = d.createElement("b"); hb.style.background = t.hd;
    var ac = d.createElement("u"); ac.style.background = t.c[3];
    pv.appendChild(hb); pv.appendChild(ac);
    var nm = d.createElement("span"); nm.className = "nm"; nm.textContent = t.n;
    o.appendChild(pv); o.appendChild(nm);
    o.onclick = function () { pick(t.id); panel().style.display = "none"; };
    return o;
  }
  function mk() {
    if (btn() && panel()) return;
    if (btn()) btn().remove();
    if (panel()) panel().remove();
    var b = d.createElement("button");
    b.id = "acs-theme-btn"; b.type = "button"; b.title = "Ganti tema tampilan"; b.onclick = window.acsToggleTheme;
    b.appendChild(d.createElement("i")); b.appendChild(d.createTextNode(""));
    var p = d.createElement("div");
    p.id = "acs-theme-panel";
    [["Terang", 0], ["Gelap", 1]].forEach(function (g) {
      var hd = d.createElement("h4"); hd.textContent = g[0]; p.appendChild(hd);
      var gr = d.createElement("div"); gr.className = "g";
      T.forEach(function (t) { if (!!t.dark === !!g[1]) gr.appendChild(sw(t)); });
      p.appendChild(gr);
    });
    h.appendChild(p); h.appendChild(b);
    apply();
  }
  apply(); mk(); setInterval(mk, 1500); // di <html>, bukan <body>: Mithril (m.route(document.body)) mengosongkan body saat start
  d.addEventListener("click", function (e) {
    var p = panel();
    if (p && p.style.display === "block" && Date.now() - openedAt > 300 && !p.contains(e.target) && !(btn() && btn().contains(e.target))) p.style.display = "none";
  });
})();
