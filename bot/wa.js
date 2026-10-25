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
const crypto = require("crypto");
const core = require("./core.js");
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
const waState = { qr: null, connected: false, me: null, since: null };

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
      return res.end(JSON.stringify({ connected: waState.connected, me: waState.me, qr: !!waState.qr, since: waState.since }));
    }
    if (url !== "/") { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bot WhatsApp - GenieACS</title>
<style>body{font-family:system-ui,sans-serif;background:#f2eddf;margin:0;padding:24px;color:#2d3748}
.card{max-width:460px;margin:0 auto;background:#fff;border-radius:10px;padding:24px;box-shadow:0 2px 10px #0002;text-align:center}
#qr{width:300px;max-width:100%;image-rendering:pixelated}.ok{color:#2f855a;font-size:20px;font-weight:700}.muted{color:#718096;font-size:14px}</style>
<div class="card"><h2>📱 Bot WhatsApp</h2><div id="st" class="muted">Memuat…</div><div id="box"></div>
<p class="muted">Di HP: WhatsApp → <b>Perangkat Tertaut</b> → <b>Tautkan Perangkat</b>, lalu arahkan kamera ke QR.<br>QR berganti otomatis tiap ±20 detik; halaman ini memperbaruinya sendiri.</p>
<p class="muted">Login sebagai: ${String(user === true ? "-" : user).replace(/[<>&]/g, "")}</p></div>
<script>
async function tick(){try{const s=await (await fetch("status.json",{cache:"no-store"})).json();
const st=document.getElementById("st"),box=document.getElementById("box");
if(s.connected){st.innerHTML='<span class="ok">✅ Tersambung</span>'+(s.me?'<br>Nomor bot: '+s.me:'');box.innerHTML='';}
else if(s.qr){st.textContent='Belum tersambung — scan QR di bawah:';box.innerHTML='<img id="qr" src="qr.svg?t='+Date.now()+'">';}
else{st.textContent='Menunggu QR dari WhatsApp…';box.innerHTML='';}}catch(e){document.getElementById("st").textContent="Bot tidak menjawab: "+e;}}
tick();setInterval(tick,4000);
</script>`);
  });
  srv.on("error", (e) => log("HTTP QR gagal di port " + port + ": " + e.message));
  srv.listen(port, "0.0.0.0", () => log("Halaman scan QR: http://<IP-SERVER>:" + port + "/  (login GenieACS dulu)"));
}

// ---------- pengaturan (namespace "wabot.*", AI tetap pakai "bot.ai.*" bersama Telegram) ----------
function loadConfig() {
  const g = readGenieConfig();
  const pick = (key, fallback) => (g[key] !== undefined && g[key] !== "" ? g[key] : fallback);
  const allowed = list(g["wabot.allowedNumbers"]); // format: 62812xxxxxxx (tanpa +, tanpa spasi)
  return {
    enabled: String(pick("wabot.enabled", "false")).toLowerCase() === "true",
    allowedNumbers: allowed,
    nbi: "http://127.0.0.1:7557",
    alertChatIds: g["wabot.alert.numbers"] ? list(g["wabot.alert.numbers"]) : [],
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

const HELP_WA = HELP +
  "\n\nKonfirmasi aksi (ubahssid/ubahpass/reboot): balas *ya* untuk menyetujui, *batal* untuk membatalkan.";

// lacak 1 pending terakhir per chat, supaya cukup balas "ya"/"batal" tanpa kode
const lastPendingByChat = {};

async function handleText(cfg, sock, jid, text) {
  const num = numFromJid(jid);
  if (cfg.allowedNumbers.indexOf(num) < 0) {
    log("WA DITOLAK", num, JSON.stringify(text.slice(0, 40)));
    return sock.sendMessage(jid, { text: "Akses ditolak. Nomor Anda: " + num + "\nMinta admin menambahkannya di GenieACS: Admin -> Config -> wabot.allowedNumbers" });
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

async function connect() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const sock = makeWASocket({ auth: state, printQRInTerminal: false, browser: ["GenieACS Bot", "Chrome", "1.0"] });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      waState.qr = qr; waState.connected = false;
      qrcodeTerminal.generate(qr, { small: true });
      try { fs.writeFileSync(QR_FILE, qr); } catch (e) { /* abaikan */ }
      log("QR baru dibuat. Scan dari WhatsApp di HP: Perangkat Tertaut -> Tautkan Perangkat.");
      log("Kalau tidak bisa lihat terminal, QR mentah ada di " + QR_FILE + " (rubah ke gambar pakai https://... atau tempel ke generator QR).");
    }
    if (connection === "close") {
      const statusCode = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
      const loggedOut = DisconnectReason && statusCode === DisconnectReason.loggedOut;
      waState.connected = false; waState.me = null;
      if (loggedOut) {
        // sesi dicabut dari HP: hapus sesi lama lalu minta QR baru otomatis (tanpa perlu terminal)
        try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch (e) { /* abaikan */ }
        setTimeout(connect, 3000);
      }
      log("WA terputus" + (loggedOut ? " (logout dari HP -- sesi dihapus, QR baru disiapkan di halaman scan)" : ", mencoba sambung ulang..."));
      if (!loggedOut) setTimeout(connect, 5000);
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
        await handleText(cfg, sock, jid, text.trim()).catch((e) => log("WA handle", e.message));
      } catch (e) { log("WA pesan error", e.message); }
    }
  });

  let lastAlert = 0;
  setInterval(() => {
    const cfg = loadConfig();
    if (!cfg.enabled || Date.now() - lastAlert < cfg.alertEveryMinutes * 60000) return;
    lastAlert = Date.now();
    checkAlerts(cfg, (jid, text) => sock.sendMessage(jid, { text })).catch((e) => log("WA alert", e.message));
  }, 60000);

  setInterval(pendingCleanup, 60000);

  return sock;
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
  await connect();
}

main().catch((e) => { log("FATAL", e.stack || e.message); process.exit(1); });
