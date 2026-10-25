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
      qrcodeTerminal.generate(qr, { small: true });
      try { fs.writeFileSync(QR_FILE, qr); } catch (e) { /* abaikan */ }
      log("QR baru dibuat. Scan dari WhatsApp di HP: Perangkat Tertaut -> Tautkan Perangkat.");
      log("Kalau tidak bisa lihat terminal, QR mentah ada di " + QR_FILE + " (rubah ke gambar pakai https://... atau tempel ke generator QR).");
    }
    if (connection === "close") {
      const statusCode = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
      const loggedOut = DisconnectReason && statusCode === DisconnectReason.loggedOut;
      log("WA terputus" + (loggedOut ? " (logout -- hapus wa_auth/ lalu scan QR ulang untuk login lagi)" : ", mencoba sambung ulang..."));
      if (!loggedOut) setTimeout(connect, 5000);
    } else if (connection === "open") {
      log("WA tersambung. Nomor diizinkan: " + loadConfig().allowedNumbers.length);
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
  log("Memulai bot WhatsApp. Jalankan ulang skrip ini kalau terminal tertutup sebelum QR sempat di-scan.");
  await connect();
}

main().catch((e) => { log("FATAL", e.stack || e.message); process.exit(1); });
