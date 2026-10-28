#!/usr/bin/env node
// GenieACS WhatsApp bot (pakai Baileys) -- transport kedua di samping Telegram (bot.js).
// Logic inti (perintah, AI, NBI) sama persis dengan Telegram, ada di core.js.
//
// BEDA dari bot.js:
// - Butuh Node 20+ dan paket npm @whiskeysockets/baileys + qrcode-terminal (lihat scripts/setup-wa-bot.sh).
// - Login pakai scan QR code sekali (tersimpan di wa_auth/, tidak perlu scan ulang kecuali logout).
// - Tidak ada tombol konfirmasi; balas teks "ya" / "batal" untuk konfirmasi aksi paling baru.
// - Hanya melayani nomor terdaftar di Admin -> Config: wabot.allowedNumbers (format 62812xxxx, tanpa +).
// - Pesan grup diabaikan; hanya chat pribadi.
//
// Pemakaian:
//   node wa.js                        # jalan sebagai bot (scan QR pertama kali)
//   node wa.js --selftest config
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { execFileSync, execFile } = require("child_process");
const crypto = require("crypto");
const core = require("./core.js");
const { mongoBin } = core;
const { log, sleep, audit, cmdCari, cmdOffline, cmdRedaman, cmdCek, cmdStatus, cmdFault,
  cmdSsid, cmdRefresh, cmdTanya, PENDING, PENDING_TTL, pendingCleanup, prepareChange, prepareReboot,
  executeChange, HELP, checkAlerts, readGenieConfig, list } = core;

let makeWASocket, useMultiFileAuthState, DisconnectReason, Boom, qrcodeTerminal;
try {
  makeWASocket = require("@whiskeysockets/baileys").default;
  ({ useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys"));
  ({ Boom } = require("@hapi/boom"));
  qrcodeTerminal = require("qrcode-terminal");
} catch (e) {
  console.error("Paket Baileys belum terpasang. Jalankan: bash scripts/setup-wa-bot.sh");
  console.error("(detail: " + e.message + ")");
  process.exit(1);
}

const AUTH_DIR = path.join(__dirname, "wa_auth");
const QR_FILE = path.join(__dirname, "wa_qr.txt");

// ---------- halaman web untuk scan QR (tanpa perlu buka terminal) ----------
// http://IP-SERVER:<wabot.httpPort, default 3010>/ -- hanya untuk user yang SUDAH LOGIN GenieACS:
// browser otomatis mengirim cookie "genieacs-ui-jwt" (cookie terikat host, bukan port), lalu
// diverifikasi dengan GENIEACS_UI_JWT_SECRET yang sama dengan GenieACS. QR digambar di server
// (SVG), tidak dikirim ke layanan luar.
const waState = { qr: null, qrAt: null, connected: false, me: null, since: null, idle: false };

function qrSvg(text) {
  const QRCode = require("qrcode-terminal/vendor/QRCode");
  const L = require("qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel");
  const q = new QRCode(-1, L.L);
  q.addData(text); q.make();
  const n = q.getModuleCount(), s = 8, pad = 4 * s, size = n * s + pad * 2;
  let rects = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (q.isDark(r, c)) rects += '<rect x="' + (pad + c * s) + '" y="' + (pad + r * s) + '" width="' + s + '" height="' + s + '"/>';
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + " " + size + '" width="' + size + '" height="' + size + '"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">' + rects + "</g></svg>";
}

function b64url(buf) { return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_"); }
function jwtValid(token, secret) {
  try {
    const [h, p, sig] = String(token || "").split(".");
    if (!h || !p || !sig) return false;
    const header = JSON.parse(Buffer.from(h, "base64").toString("utf8"));
    if (header.alg !== "HS256") return false;
    const expect = b64url(crypto.createHmac("sha256", secret).update(h + "." + p).digest());
    if (expect.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(sig))) return false;
    const payload = JSON.parse(Buffer.from(p, "base64").toString("utf8"));
    if (payload.exp && payload.exp * 1000 < Date.now()) return false;
    return payload.username || true;
  } catch (e) { return false; }
}
function cookie(req, name) {
  const m = String(req.headers.cookie || "").split(/;\s*/).find((c) => c.indexOf(name + "=") === 0);
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}

// Halaman ada di wa-page.html (dibaca ulang tiap permintaan supaya edit tampilan tidak perlu restart)
function pageHtml() {
  try { return fs.readFileSync(path.join(__dirname, "wa-page.html"), "utf8"); }
  catch (e) { return "<meta charset=utf-8><p>wa-page.html tidak ditemukan di " + __dirname + " -- jalankan ulang scripts/setup-wa-bot.sh</p>"; }
}

function startHttp(port) {
  const secret = process.env.GENIEACS_UI_JWT_SECRET;
  if (!secret) log("PERINGATAN: GENIEACS_UI_JWT_SECRET tidak terbaca -- halaman QR web dimatikan (lihat docs/WHATSAPP-BOT.md).");
  const srv = http.createServer((req, res) => {
    const user = secret && jwtValid(cookie(req, "genieacs-ui-jwt"), secret);
    if (!user) {
      res.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
      return res.end('<meta charset="utf-8"><body style="font-family:sans-serif;padding:2em">' +
        "<h2>Login GenieACS dulu</h2><p>Halaman ini hanya untuk admin yang sudah login ke GenieACS di server ini " +
        "(alamat IP/host harus sama). Buka GenieACS, login, lalu muat ulang halaman ini.</p></body>");
    }
    const url = req.url.split("?")[0];
    if (url === "/qr.svg") {
      if (!waState.qr) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
      return res.end(qrSvg(waState.qr));
    }
    if (url === "/status.json") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify({ connected: waState.connected, me: waState.me, qr: !!waState.qr,
        qrAge: waState.qrAt ? Math.round((Date.now() - waState.qrAt) / 1000) : null, idle: waState.idle, since: waState.since }));
    }
    if (url === "/summary.json") {
      // ringkasan HANYA-BACA pengaturan bot dari Admin -> Config; nilai rahasia tidak pernah dikirim
      const g = readGenieConfig();
      const on = (k, d) => String(g[k] === undefined || g[k] === "" ? d : g[k]).toLowerCase() === "true";
      const n = (k) => list(g[k]).length;
      const svc = (name) => { try { return execFileSync("systemctl", ["is-active", name], { encoding: "utf8" }).trim(); } catch (e) { return String(e.stdout || "").trim() || "tidak terpasang"; } };
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify({
        wa: { enabled: on("wabot.enabled", "false"), allowed: n("wabot.allowedNumbers"), actions: on("wabot.actions.enabled", "false"), alerts: n("wabot.alert.numbers") },
        telegram: { service: svc("genieacs-bot"), enabled: on("bot.enabled", "true"), tokenSet: !!g["bot.telegram.token"] && !/^ISI_/.test(g["bot.telegram.token"]),
          allowed: n("bot.telegram.allowedChatIds"), actions: on("bot.actions.enabled", "false"), alerts: n("bot.alert.chatIds") },
        ai: { enabled: on("bot.ai.enabled", "false"), provider: g["bot.ai.provider"] || "anthropic", model: g["bot.ai.model"] || "claude-opus-5-5",
          keySet: !!g["bot.ai.apiKey"], baseUrl: !!g["bot.ai.baseUrl"], dailyLimit: parseInt(g["bot.ai.dailyLimit"], 10) || 50 }
      }));
    }
    if (url === "/new-qr" && req.method === "POST") {
      const r = requestNewQr();
      log("Halaman scan: " + (user === true ? "-" : user) + " minta QR baru -> " + r);
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify({ result: r }));
    }
    if (url !== "/") { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(pageHtml().replace("__USER__", String(user === true ? "-" : user).replace(/[<>&"']/g, "")));
  });
  srv.on("error", (e) => log("HTTP QR gagal di port " + port + ": " + e.message));
  srv.listen(port, "0.0.0.0", () => log("Halaman scan QR: http://<IP-SERVER>:" + port + "/  (login GenieACS dulu)"));
}

// ---------- pengaturan (namespace "wabot.*", AI tetap pakai "bot.ai.*" bersama Telegram) ----------
function loadConfig() {
  const g = readGenieConfig();
  const pick = (key, fallback) => (g[key] !== undefined && g[key] !== "" ? g[key] : fallback);
  const allowed = list(g["wabot.allowedNumbers"]).map(normNum).filter((x) => x); // 0812.. / +62 812.. / 62812.. semua diterima
  return {
    enabled: String(pick("wabot.enabled", "false")).toLowerCase() === "true",
    allowedNumbers: allowed,
    nbi: "http://127.0.0.1:7557",
    // WhatsApp butuh JID "62xxx@s.whatsapp.net", bukan nomor mentah "0822.."
    alertChatIds: list(g["wabot.alert.numbers"]).map(normNum).filter((x) => x).map((x) => x + "@s.whatsapp.net"),
    alertEveryMinutes: parseInt(pick("wabot.alert.everyMinutes", 10), 10) || 10,
    alertFaultThreshold: parseInt(pick("wabot.alert.faultThreshold", 20), 10) || 20,
    actionsEnabled: String(pick("wabot.actions.enabled", "false")).toLowerCase() === "true",
    httpPort: parseInt(pick("wabot.httpPort", 3010), 10) || 3010,
    // AI dibagi dengan bot.js (satu pengaturan untuk semua transport)
    aiEnabled: String(pick("bot.ai.enabled", "false")).toLowerCase() === "true",
    aiProvider: String(pick("bot.ai.provider", "anthropic")).toLowerCase(),
    aiApiKey: pick("bot.ai.apiKey", ""),
    aiBaseUrl: pick("bot.ai.baseUrl", ""),
    aiModel: pick("bot.ai.model", "claude-opus-5-5"),
    aiDailyLimit: parseInt(pick("bot.ai.dailyLimit", 50), 10) || 50
  };
}

function numFromJid(jid) { return String(jid || "").replace(/@.*/, "").replace(/^\+/, ""); }
// Samakan format nomor: "0822-1453-5152", "+62 822...", "822..." -> "6282214535152"
function normNum(s) {
  let d = String(s || "").replace(/[^0-9]/g, "");
  if (d.indexOf("0") === 0) d = "62" + d.slice(1);
  else if (d.indexOf("8") === 0) d = "62" + d;
  return d;
}

const HELP_WA = HELP + "\n\nDi WhatsApp perintah boleh tanpa '/': ketik saja status, cek budi, cari rw01, dst." +
  "\n\nKonfirmasi aksi (ubahssid/ubahpass/reboot): balas *ya* untuk menyetujui, *batal* untuk membatalkan.";

const WA_CMDS = ["cek", "cari", "ssid", "ubahssid", "ubahpass", "refresh", "reboot", "tanya", "ai",
  "status", "fault", "offline", "redaman", "help", "menu", "start"];

// lacak 1 pending terakhir per chat, supaya cukup balas "ya"/"batal" tanpa kode
const lastPendingByChat = {};

async function handleText(cfg, sock, jid, text, phone) {
  const num = normNum(phone || numFromJid(jid));
  if (cfg.allowedNumbers.indexOf(num) < 0) {
    // Diam saja (tidak membalas): nomor bot sering nomor WA biasa yang juga dipakai chat dengan
    // pelanggan/kontak lain -- jangan sampai mereka menerima balasan otomatis. Cukup dicatat di log.
    log("WA diabaikan (nomor tidak terdaftar)", num);
    return;
  }
  log("WA chat", num, JSON.stringify(text.slice(0, 60)));

  // konfirmasi "ya" / "batal" untuk pending terakhir chat ini
  const lower = text.trim().toLowerCase();
  if (/^(ya|y|batal|tidak|no)(\s|$)/.test(lower)) {
    const explicit = lower.match(/\b([a-z0-9]{8})\b/); // boleh sebut kode eksplisit: "ya ab12cd34"
    const key = (explicit && PENDING[explicit[1]]) ? explicit[1] : lastPendingByChat[jid];
    const p = key && PENDING[key];
    if (!p) return sock.sendMessage(jid, { text: "Tidak ada aksi yang menunggu konfirmasi." });
    if (p.chatId !== jid || Date.now() - p.created > PENDING_TTL) {
      delete PENDING[key]; delete lastPendingByChat[jid];
      return sock.sendMessage(jid, { text: "Permintaan sudah kedaluwarsa atau tidak dikenal. Ulangi perintahnya." });
    }
    delete PENDING[key]; delete lastPendingByChat[jid];
    if (/^(batal|tidak|no)/.test(lower)) {
      audit("WA BATAL " + num + " " + p.kind + " " + p.deviceId + " [" + p.idx + "]");
      return sock.sendMessage(jid, { text: "Dibatalkan." });
    }
    if (!cfg.actionsEnabled) return sock.sendMessage(jid, { text: "Aksi sedang dimatikan (wabot.actions.enabled)." });
    const res = await executeChange(cfg, p).catch((e) => "❌ Gagal: " + e.message);
    audit((p.kind === "reboot" ? "WA REBOOT " + num + " " + p.deviceId :
      "WA UBAH " + num + " " + p.kind + " " + p.deviceId + " [" + p.idx + "] " + (p.kind === "ssid" ? "'" + p.oldSsid + "' -> '" + p.value + "'" : "(password disembunyikan)")) + " => " + res.split("\n")[0]);
    return sock.sendMessage(jid, { text: res });
  }

  // Di WhatsApp orang sering mengetik perintah tanpa "/": "status", "cek budi" -> "/status", "/cek budi"
  const first = text.trim().split(/\s+/)[0].toLowerCase();
  if (first[0] !== "/" && WA_CMDS.indexOf(first) >= 0) text = "/" + text.trim();
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(" ");
  let out, pendingKey;
  try {
    if (cmd === "/ubahssid" || cmd === "/ubahpass") {
      const m = text.match(/^\/\S+\s+(\S+)\s+(\d+)\s+([\s\S]+)$/);
      if (!m) out = "Pakai: " + cmd + " <kata kunci> <nomor SSID> <" + (cmd === "/ubahssid" ? "nama baru" : "password baru") + ">\nLihat nomor SSID: /ssid <kata kunci>";
      else {
        const res = await prepareChange(cfg, jid, cmd === "/ubahssid" ? "ssid" : "pass", m[1], m[2], cmd === "/ubahssid" ? m[3].trim() : m[3]);
        out = res.text; pendingKey = res.key;
      }
    }
    else if (cmd === "/ssid") out = arg ? await cmdSsid(cfg, arg) : "Pakai: /ssid <username/SN/IP>";
    else if (cmd === "/refresh") out = arg ? await cmdRefresh(cfg, jid, arg) : "Pakai: /refresh <username/SN/IP>";
    else if (cmd === "/tanya" || cmd === "/ai") {
      if (cfg.aiEnabled && cfg.aiApiKey && arg) await sock.sendMessage(jid, { text: "⏳ Menganalisis..." }).catch(() => {});
      out = await cmdTanya(cfg, jid, arg);
    }
    else if (cmd === "/reboot") {
      if (!arg) out = "Pakai: /reboot <username/SN/IP>";
      else { const res = await prepareReboot(cfg, jid, arg); out = res.text; pendingKey = res.key; }
    }
    else if (cmd === "/start" || cmd === "/help" || cmd === "/menu") out = HELP_WA;
    else if (cmd === "/cek") out = arg ? await cmdCek(cfg, arg) : "Pakai: /cek <username/SN/IP>";
    else if (cmd === "/status") out = await cmdStatus(cfg);
    else if (cmd === "/fault") out = await cmdFault(cfg);
    else if (cmd === "/cari") out = arg ? await cmdCari(cfg, arg) : "Pakai: /cari <kata>";
    else if (cmd === "/offline") out = await cmdOffline(cfg);
    else if (cmd === "/redaman") out = await cmdRedaman(cfg, arg);
    else if (cmd[0] === "/") out = "Perintah tidak dikenal.\n\n" + HELP_WA;
    else out = await cmdCek(cfg, text);
  } catch (e) {
    log("WA ERROR", e.message);
    out = "Gagal: " + e.message;
  }
  if (pendingKey) { lastPendingByChat[jid] = pendingKey; out += "\n\nBalas *ya* untuk konfirmasi, *batal* untuk batalkan."; }
  return sock.sendMessage(jid, { text: out });
}

// Sesi pairing (QR) hanya dibuat saat service start atau saat admin klik "Minta QR baru" di halaman
// scan -- TIDAK diulang otomatis terus-menerus setelah QR habis. Koneksi yang SUDAH login tetap
// disambung ulang otomatis kalau putus (supaya bot tidak mati karena gangguan jaringan).
let sockRef = null;

async function connect() {
  waState.idle = false; waState.qr = null;
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const sock = makeWASocket({ auth: state, printQRInTerminal: false, browser: ["GenieACS Bot", "Chrome", "1.0"] });
  sockRef = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      waState.qr = qr; waState.connected = false; waState.qrAt = Date.now();
      qrcodeTerminal.generate(qr, { small: true });
      try { fs.writeFileSync(QR_FILE, qr); } catch (e) { /* abaikan */ }
      log("QR baru dibuat. Scan di halaman web (port " + loadConfig().httpPort + ") atau dari terminal ini.");
    }
    if (connection === "close") {
      if (sockRef !== sock) return; // socket lama yang sudah diganti
      const statusCode = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
      const loggedOut = DisconnectReason && statusCode === DisconnectReason.loggedOut;
      const wasLoggedIn = !!(state.creds && state.creds.registered) && !loggedOut;
      waState.connected = false; waState.me = null; waState.qr = null;
      if (loggedOut) {
        try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch (e) { /* abaikan */ }
      }
      if (wasLoggedIn) {
        log("WA terputus, mencoba sambung ulang...");
        setTimeout(connect, 5000);
      } else {
        waState.idle = true; sockRef = null;
        log("WA belum tersambung" + (loggedOut ? " (logout dari HP, sesi dihapus)" : " (QR kedaluwarsa)") +
          ". Menunggu admin klik 'Minta QR baru' di halaman scan.");
      }
    } else if (connection === "open") {
      waState.connected = true; waState.qr = null; waState.since = new Date().toISOString();
      waState.me = sock.user && sock.user.id ? numFromJid(sock.user.id).replace(/:.*/, "") : null;
      log("WA tersambung" + (waState.me ? " sebagai " + waState.me : "") + ". Nomor diizinkan: " + loadConfig().allowedNumbers.length);
      try { fs.unlinkSync(QR_FILE); } catch (e) { /* tidak ada */ }
    }
  });

  sock.ev.on("messages.upsert", async (event) => {
    if (event.type !== "notify") return;
    const cfg = loadConfig(); // dibaca ulang tiap pesan: perubahan Config langsung berlaku
    if (!cfg.enabled) return;
    for (const m of event.messages) {
      try {
        if (m.key.fromMe) continue;
        const jid = m.key.remoteJid;
        if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") continue; // abaikan grup & status
        const text = (m.message && (m.message.conversation || (m.message.extendedTextMessage && m.message.extendedTextMessage.text))) || "";
        if (!text.trim()) continue;
        // WhatsApp baru kadang memakai ID samaran "@lid" sebagai pengirim; nomor HP aslinya ada di senderPn
        const phone = jid.endsWith("@lid") ? numFromJid(m.key.senderPn || m.key.participantPn || "") : numFromJid(jid);
        if (!phone) { log("WA diabaikan: pengirim @lid tanpa nomor HP", jid); continue; }
        await handleText(cfg, sock, jid, text.trim(), phone).catch((e) => log("WA handle", e.message));
      } catch (e) { log("WA pesan error", e.message); }
    }
  });

  return sock;
}

// Timer dipasang SEKALI (bukan per sambung ulang -- dulu tiap reconnect menambah timer alert baru)
// ---------- QR lewat Config (untuk admin yang hanya bisa menjangkau port GenieACS UI) ----------
// Status dan gambar QR (SVG) ditulis ke Config "wabot.status" / "wabot.qrsvg" (base64 dalam kutip tunggal, supaya
// tetap ekspresi Config yang valid) dan dibaca halaman Admin -> "📱 Bot WA" (/wa.html) lewat API GenieACS, jadi
// butuh login GenieACS. Hanya ditulis saat isinya berubah. QR dikosongkan begitu tersambung / kedaluwarsa.
// Tombol "Minta QR baru" di halaman itu menulis "wabot.requestQr"; nilai yang berubah = permintaan baru.
let lastPub = "";
function publishState() {
  const st = { connected: waState.connected, me: waState.me, since: waState.since, idle: waState.idle,
    qrAt: waState.qrAt, hasQr: !!waState.qr, updated: Date.now() };
  const stVal = "'" + Buffer.from(JSON.stringify(Object.assign({}, st, { updated: 0 }))).toString("base64") + "'";
  const qrVal = waState.qr ? "'" + Buffer.from(qrSvg(waState.qr)).toString("base64") + "'" : "''";
  if (stVal + qrVal === lastPub) return;
  lastPub = stVal + qrVal;
  const full = "'" + Buffer.from(JSON.stringify(st)).toString("base64") + "'";
  const js = "var s=" + JSON.stringify(full) + ",q=" + JSON.stringify(qrVal) + ";" +
    'db.config.updateOne({_id:"wabot.status"},{$set:{value:s}},{upsert:true});' +
    'db.config.updateOne({_id:"wabot.qrsvg"},{$set:{value:q}},{upsert:true});';
  let bin; try { bin = mongoBin(); } catch (e) { return; }
  execFile(bin, ["genieacs", "--quiet", "--eval", js], { timeout: 15000 }, (err) => {
    if (err) { lastPub = ""; log("WA: gagal menulis status ke Config:", err.message); }
  });
}

function startTimers() {
  let lastReq = String(readGenieConfig()["wabot.requestQr"] || "");
  setInterval(() => {
    try { publishState(); } catch (e) { log("WA publish", e.message); }
  }, 3000);
  setInterval(() => {
    if (!waState.idle || waState.connected) return;
    const r = String(readGenieConfig()["wabot.requestQr"] || "");
    if (r && r !== lastReq) { lastReq = r; log("Halaman Bot WA: minta QR baru ->", requestNewQr()); }
  }, 5000);
  let lastAlert = 0;
  setInterval(() => {
    const cfg = loadConfig();
    if (!cfg.enabled || !waState.connected || !sockRef || Date.now() - lastAlert < cfg.alertEveryMinutes * 60000) return;
    lastAlert = Date.now();
    checkAlerts(cfg, (jid, text) => sockRef.sendMessage(jid, { text })).catch((e) => log("WA alert", e.message));
  }, 60000);
  setInterval(pendingCleanup, 60000);
}

// dipanggil dari tombol "Minta QR baru" di halaman scan
function requestNewQr() {
  if (waState.connected) return "sudah tersambung";
  if (!waState.idle) return "sesi QR masih aktif";
  connect().catch((e) => log("WA connect", e.message));
  return "QR baru diminta";
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--selftest") {
    const cfg = loadConfig();
    const what = args[1];
    if (what === "config") console.log(JSON.stringify({ enabled: cfg.enabled, allowedNumbers: cfg.allowedNumbers, aiEnabled: cfg.aiEnabled, aiProvider: cfg.aiProvider }));
    else if (what === "cek") console.log(await cmdCek(cfg, args.slice(2).join(" ")));
    else if (what === "status") console.log(await cmdStatus(cfg));
    else if (what === "help") console.log(HELP_WA);
    else console.log("selftest: config | cek <q> | status | help");
    return;
  }
  log("Memulai bot WhatsApp.");
  startHttp(loadConfig().httpPort);
  startTimers();
  await connect();
}

main().catch((e) => { log("FATAL", e.stack || e.message); process.exit(1); });
