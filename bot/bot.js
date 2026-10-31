#!/usr/bin/env node
// GenieACS Telegram bot - TAHAP 1-3: baca, aksi dengan konfirmasi, asisten AI.
// - Logic inti (perintah, AI, NBI) ada di core.js, dipakai bersama dengan wa.js (WhatsApp).
// - Pengaturan dibaca dari GenieACS Admin -> Config (entri "bot.*"); config.json hanya cadangan.
// - Hanya melayani chat ID terdaftar; daftar kosong = semua ditolak.
// - Tanpa dependensi npm; kompatibel Node 12.
//
// Pemakaian:
//   node bot.js                       # jalan sebagai bot
//   node bot.js --selftest cek <q>    # uji tanpa Telegram
//   node bot.js --selftest status|fault|config
"use strict";

const fs = require("fs");
const path = require("path");
const core = require("./core.js");
const { log, sleep, audit, request, cmdCari, cmdOffline, cmdRedaman, cmdCek, cmdStatus, cmdFault,
  cmdSsid, cmdRefresh, cmdTanya, PENDING, PENDING_TTL, pendingCleanup, prepareChange, prepareReboot,
  executeChange, aiRunTool, makeHelp, contentSettings, checkAlerts, readGenieConfig, list } = core;

const CONFIG_FILE = path.join(__dirname, "config.json");

// ---------- pengaturan ----------
function loadConfig() {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch (e) { /* tidak ada */ }
  const g = readGenieConfig();
  const pick = (key, fallback) => (g[key] !== undefined && g[key] !== "" ? g[key] : fallback);
  const allowed = g["bot.telegram.allowedChatIds"] ? list(g["bot.telegram.allowedChatIds"]) : (c.allowedChatIds || []).map(String);
  return {
    enabled: String(pick("bot.enabled", "true")).toLowerCase() !== "false",
    token: pick("bot.telegram.token", c.token || ""),
    allowedChatIds: allowed,
    nbi: c.nbi || "http://127.0.0.1:7557",
    alertChatIds: g["bot.alert.chatIds"] ? list(g["bot.alert.chatIds"]) : allowed,
    alertEveryMinutes: parseInt(pick("bot.alert.everyMinutes", c.alertEveryMinutes || 10), 10) || 10,
    alertFaultThreshold: parseInt(pick("bot.alert.faultThreshold", c.alertFaultThreshold || 20), 10) || 20,
    // aksi (ubah SSID/password) hanya bila bot.actions.enabled = 'true'
    actionsEnabled: String(pick("bot.actions.enabled", "false")).toLowerCase() === "true",
    // asisten AI (hanya baca) -- lihat core.js & docs/TELEGRAM-BOT.md "Provider AI"
    aiEnabled: String(pick("bot.ai.enabled", "false")).toLowerCase() === "true",
    aiProvider: String(pick("bot.ai.provider", "anthropic")).toLowerCase(),
    aiApiKey: pick("bot.ai.apiKey", ""),
    aiBaseUrl: pick("bot.ai.baseUrl", ""),
    aiModel: pick("bot.ai.model", "claude-opus-5-5"),
    aiDailyLimit: parseInt(pick("bot.ai.dailyLimit", 50), 10) || 50,
    // isi bot (ambang redaman, jumlah daftar, dll) dari Config bot.* -- diatur di halaman Pengaturan Bot
    ...contentSettings(pick)
  };
}

// ---------- Telegram HTTP ----------
async function tg(cfg, method, payload) {
  const body = JSON.stringify(payload || {});
  const r = await request("https://api.telegram.org/bot" + cfg.token + "/" + method,
    { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, body);
  let j = {};
  try { j = JSON.parse(r.body || "{}"); } catch (e) { /* bukan JSON */ }
  if (!j.ok) throw new Error("Telegram " + method + ": " + (j.description || ("HTTP " + r.status)));
  return j.result;
}

async function send(cfg, chatId, text) {
  // teks biasa (tanpa parse_mode) supaya isi dari device tidak merusak format
  for (let i = 0; i < text.length; i += 3800) {
    await tg(cfg, "sendMessage", { chat_id: chatId, text: text.slice(i, i + 3800), disable_web_page_preview: true });
  }
}

async function handleCallback(cfg, cq) {
  const chatId = String(cq.message && cq.message.chat ? cq.message.chat.id : cq.from.id);
  const data = String(cq.data || "");
  const key = data.slice(3);
  const p = PENDING[key];
  await tg(cfg, "answerCallbackQuery", { callback_query_id: cq.id }).catch(() => {});
  if (cfg.allowedChatIds.indexOf(chatId) < 0) return;
  // hapus tombol supaya tidak bisa ditekan dua kali
  if (cq.message) await tg(cfg, "editMessageReplyMarkup", { chat_id: chatId, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
  if (!p || p.chatId !== chatId || Date.now() - p.created > PENDING_TTL) { delete PENDING[key]; return send(cfg, chatId, "Permintaan sudah kedaluwarsa atau tidak dikenal. Ulangi perintahnya."); }
  delete PENDING[key];
  const who = (cq.from && (cq.from.username || cq.from.id)) || chatId;
  if (data.indexOf("no:") === 0) { audit("BATAL " + who + " " + p.kind + " " + p.deviceId + " [" + p.idx + "]"); return send(cfg, chatId, "Dibatalkan."); }
  if (!cfg.actionsEnabled) return send(cfg, chatId, "Aksi sedang dimatikan (bot.actions.enabled).");
  const res = await executeChange(cfg, p).catch((e) => "❌ Gagal: " + e.message);
  audit((p.kind === "reboot" ? "REBOOT " + who + " " + p.deviceId :
    "UBAH " + who + " " + p.kind + " " + p.deviceId + " [" + p.idx + "] " + (p.kind === "ssid" ? "'" + p.oldSsid + "' -> '" + p.value + "'" : "(password disembunyikan)")) + " => " + res.split("\n")[0]);
  return send(cfg, chatId, res);
}

const helpTg = (cfg) => makeHelp(cfg) + "\n/id                - chat ID Anda";

async function handle(cfg, msg) {
  const chatId = String(msg.chat.id);
  const text = (msg.text || "").trim();
  if (text === "/id" || text.indexOf("/id@") === 0) return send(cfg, chatId, "Chat ID: " + chatId);
  if (cfg.allowedChatIds.indexOf(chatId) < 0) {
    log("DITOLAK chat", chatId, JSON.stringify(text.slice(0, 40)));
    return send(cfg, chatId, "Akses ditolak. Chat ID Anda: " + chatId + "\nMinta admin menambahkannya di GenieACS: Admin -> Config -> bot.telegram.allowedChatIds");
  }
  log("chat", chatId, JSON.stringify(text.slice(0, 60)));
  const parts = text.split(/\s+/);
  const cmd = parts[0].replace(/@.*/, "").toLowerCase();
  const arg = parts.slice(1).join(" ");
  let out, keyboard;
  try {
    if (cmd === "/ubahssid" || cmd === "/ubahpass") {
      // nama/password boleh berisi spasi: ambil sisa teks apa adanya
      const m = text.match(/^\/\S+\s+(\S+)\s+(\d+)\s+([\s\S]+)$/);
      if (cmd === "/ubahpass" && msg.message_id) {
        // pesan berisi password dihapus dari chat
        await tg(cfg, "deleteMessage", { chat_id: chatId, message_id: msg.message_id }).catch(() => {});
      }
      if (!m) out = "Pakai: " + cmd + " <kata kunci> <nomor SSID> <" + (cmd === "/ubahssid" ? "nama baru" : "password baru") + ">\nLihat nomor SSID: /ssid <kata kunci>";
      else {
        const res = await prepareChange(cfg, chatId, cmd === "/ubahssid" ? "ssid" : "pass", m[1], m[2], cmd === "/ubahssid" ? m[3].trim() : m[3]);
        out = res.text; keyboard = res.keyboard;
      }
    }
    else if (cmd === "/ssid") out = arg ? await cmdSsid(cfg, arg) : "Pakai: /ssid <username/SN/IP>";
    else if (cmd === "/refresh") out = arg ? await cmdRefresh(cfg, chatId, arg) : "Pakai: /refresh <username/SN/IP>";
    else if (cmd === "/tanya" || cmd === "/ai") {
      if (cfg.aiEnabled && cfg.aiApiKey && arg) await send(cfg, chatId, "⏳ Menganalisis...").catch(() => {});
      out = await cmdTanya(cfg, chatId, arg);
    }
    else if (cmd === "/reboot") {
      if (!arg) out = "Pakai: /reboot <username/SN/IP>";
      else { const res = await prepareReboot(cfg, chatId, arg); out = res.text; keyboard = res.keyboard; }
    }
    else if (cmd === "/start" || cmd === "/help" || cmd === "/menu") out = helpTg(cfg);
    else if (cmd === "/cek") out = arg ? await cmdCek(cfg, arg) : "Pakai: /cek <username/SN/IP>";
    else if (cmd === "/status") out = await cmdStatus(cfg);
    else if (cmd === "/fault") out = await cmdFault(cfg);
    else if (cmd === "/cari") out = arg ? await cmdCari(cfg, arg) : "Pakai: /cari <kata>";
    else if (cmd === "/offline") out = await cmdOffline(cfg);
    else if (cmd === "/redaman") out = await cmdRedaman(cfg, arg);
    else if (cmd[0] === "/") out = "Perintah tidak dikenal.\n\n" + helpTg(cfg);
    else out = await cmdCek(cfg, text);
  } catch (e) {
    log("ERROR", e.message);
    out = "Gagal: " + e.message;
  }
  if (keyboard) return tg(cfg, "sendMessage", { chat_id: chatId, text: out, reply_markup: keyboard });
  return send(cfg, chatId, out);
}

// ---------- main ----------
async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--selftest") {
    const cfg = loadConfig();
    const what = args[1];
    if (what === "cek") console.log(await cmdCek(cfg, args.slice(2).join(" ")));
    else if (what === "status") console.log(await cmdStatus(cfg));
    else if (what === "fault") console.log(await cmdFault(cfg));
    else if (what === "cari") console.log(await cmdCari(cfg, args.slice(2).join(" ")));
    else if (what === "offline") console.log(await cmdOffline(cfg));
    else if (what === "redaman") console.log(await cmdRedaman(cfg, args[2]));
    else if (what === "help") console.log(helpTg(cfg));
    else if (what === "ssid") console.log(await cmdSsid(cfg, args.slice(2).join(" ")));
    else if (what === "prepare-reboot") {
      // hanya menyiapkan konfirmasi; TIDAK me-reboot
      const res = await prepareReboot(Object.assign({}, cfg, { actionsEnabled: true }), "selftest", args.slice(2).join(" "));
      console.log(res.text + (res.keyboard ? "\n[selftest] tombol: " + res.keyboard.inline_keyboard[0].map((b) => b.text).join(" / ") : ""));
    }
    else if (what === "refresh") console.log(await cmdRefresh(cfg, "selftest", args.slice(2).join(" ")));
    else if (what === "ai-tool") {
      // uji satu tool AI tanpa memanggil API AI: --selftest ai-tool <nama> '<json input>'
      console.log(await aiRunTool(cfg, args[2], JSON.parse(args[3] || "{}")));
    }
    else if (what === "tanya") console.log(await cmdTanya(cfg, "selftest", args.slice(2).join(" ")));
    else if (what === "prepare") {
      // hanya menyiapkan konfirmasi; TIDAK mengeksekusi perubahan
      const c2 = Object.assign({}, cfg, { actionsEnabled: true });
      const res = await prepareChange(c2, "selftest", args[2], args[3], args[4], args.slice(5).join(" "));
      console.log(res.text + (res.key ? "\n[selftest] parameter yang akan diubah: " + PENDING[res.key].path : ""));
    }
    else if (what === "config") console.log(JSON.stringify({ enabled: cfg.enabled, tokenSet: !!cfg.token, allowedChatIds: cfg.allowedChatIds, alertChatIds: cfg.alertChatIds, alertEveryMinutes: cfg.alertEveryMinutes, alertFaultThreshold: cfg.alertFaultThreshold, aiEnabled: cfg.aiEnabled, aiProvider: cfg.aiProvider, aiModel: cfg.aiModel, aiApiKeySet: !!cfg.aiApiKey }));
    else console.log("selftest: cek <q> | status | fault | config");
    return;
  }

  let offset = 0, lastAlert = 0, activeToken = "", waiting = false;
  for (;;) {
    const cfg = loadConfig();   // dibaca ulang tiap putaran: perubahan di Admin -> Config langsung berlaku
    if (!cfg.enabled || !cfg.token) {
      if (!waiting) log("bot menunggu: isi bot.telegram.token (dan bot.enabled = 'true') di GenieACS Admin -> Config");
      waiting = true; activeToken = "";
      await sleep(30000);
      continue;
    }
    waiting = false;
    if (cfg.token !== activeToken) {
      try {
        const me = await tg(cfg, "getMe");
        log("bot aktif: @" + me.username + " | chat diizinkan: " + cfg.allowedChatIds.length);
        activeToken = cfg.token; offset = 0;
      } catch (e) {
        log("token belum valid:", e.message);
        await sleep(60000);
        continue;
      }
    }
    try {
      const updates = await tg(cfg, "getUpdates", { offset: offset, timeout: 50, allowed_updates: ["message", "callback_query"] });
      for (const u of updates) {
        offset = u.update_id + 1;
        if (u.message && u.message.text) await handle(cfg, u.message).catch((e) => log("handle", e.message));
        else if (u.callback_query) await handleCallback(cfg, u.callback_query).catch((e) => log("callback", e.message));
      }
      pendingCleanup();
    } catch (e) {
      log("polling", e.message);
      await sleep(5000);
    }
    if (Date.now() - lastAlert > cfg.alertEveryMinutes * 60000) {
      lastAlert = Date.now();
      await checkAlerts(cfg, (id, text) => send(cfg, id, text)).catch((e) => log("alert", e.message));
    }
  }
}

main().catch((e) => { log("FATAL", e.stack || e.message); process.exit(1); });
