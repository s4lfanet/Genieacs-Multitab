#!/usr/bin/env node
// GenieACS Telegram bot - TAHAP 1: BACA SAJA.
// - Hanya GET ke NBI GenieACS (tidak ada task, tidak ada tulis ke MongoDB).
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
const http = require("http");
const https = require("https");
const { execFileSync } = require("child_process");

const CONFIG_FILE = path.join(__dirname, "config.json");
const STATE_FILE = path.join(__dirname, "state.json");
const REPORT_LOG = path.join(process.env.HOME || require("os").homedir(), "genieacs-backup", "huawei-remoteweb-report.log");

// ---------- pengaturan ----------
// Nilai di Config GenieACS adalah ekspresi, jadi teks ditulis dengan kutip tunggal: 'nilai'.
function readGenieConfig() {
  const js = "var o={}; db.config.find({_id: /^bot[.]/}).forEach(function(c){ o[c._id] = String(c.value); }); print(JSON.stringify(o))";
  try {
    const out = execFileSync("mongo", ["genieacs", "--quiet", "--eval", js], { encoding: "utf8", timeout: 15000 });
    const o = JSON.parse(out.trim().split("\n").pop());
    const r = {};
    Object.keys(o).forEach((k) => {
      let v = String(o[k]).trim();
      if (v.length >= 2 && ((v[0] === "'" && v[v.length - 1] === "'") || (v[0] === '"' && v[v.length - 1] === '"'))) v = v.slice(1, -1);
      r[k] = v.trim();
    });
    return r;
  } catch (e) {
    return {};
  }
}

function list(v) { return String(v || "").split(/[\s,;]+/).map((x) => x.trim()).filter((x) => x); }

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
    // asisten AI (hanya baca)
    aiEnabled: String(pick("bot.ai.enabled", "false")).toLowerCase() === "true",
    aiApiKey: pick("bot.ai.apiKey", ""),
    aiModel: pick("bot.ai.model", "claude-opus-5-5"),
    aiDailyLimit: parseInt(pick("bot.ai.dailyLimit", 50), 10) || 50
  };
}

function log() { console.log(new Date().toISOString(), Array.prototype.join.call(arguments, " ")); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- HTTP ----------
function request(url, opts, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(u, Object.assign({ timeout: 70000 }, opts), (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (d) => { data += d; });
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// NBI: hanya GET
async function nbiGet(cfg, resource, query, projection, extra) {
  let url = cfg.nbi + "/" + resource + "/?query=" + encodeURIComponent(JSON.stringify(query || {}));
  if (projection) url += "&projection=" + encodeURIComponent(projection.join(","));
  if (extra) url += extra;
  const r = await request(url, { method: "GET" });
  if (r.status !== 200) throw new Error("NBI " + resource + " HTTP " + r.status);
  return JSON.parse(r.body);
}

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

// ---------- data ----------
function val(dev, p) {
  let o = dev;
  for (const k of p.split(".")) { if (!o) return undefined; o = o[k]; }
  return o && Object.prototype.hasOwnProperty.call(o, "_value") ? o._value : undefined;
}
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function ago(ts) {
  if (!ts) return "-";
  const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 120) return s + " detik lalu";
  if (s < 7200) return Math.round(s / 60) + " menit lalu";
  if (s < 172800) return Math.round(s / 3600) + " jam lalu";
  return Math.round(s / 86400) + " hari lalu";
}
function webCheck(ip) {
  if (!ip || ip === "-" || ip === "0.0.0.0") return Promise.resolve(null);
  return request("http://" + ip + "/", { method: "GET", timeout: 5000 }).then((r) => r.status).catch(() => 0);
}

const PROJ = ["_id", "_lastInform", "_deviceId",
  "VirtualParameters.pppoeUsername", "VirtualParameters.pppoeIP", "VirtualParameters.IPTR069",
  "VirtualParameters.RXPower", "VirtualParameters.gettemp", "VirtualParameters.getdeviceuptime",
  "VirtualParameters.getpppuptime", "VirtualParameters.getponmode", "VirtualParameters.getSerialNumber",
  "VirtualParameters.activedevices", "VirtualParameters.ssidActive",
  "InternetGatewayDevice.DeviceInfo.SoftwareVersion"];

async function findDevices(cfg, q, limit) {
  q = (q || "").trim();
  if (q.replace(/[^A-Za-z0-9]/g, "").length < 3) return { error: "Kata kunci minimal 3 huruf/angka." };
  const re = { $regex: escRe(q), $options: "i" };
  const query = { $or: [
    { _id: re },
    { "VirtualParameters.pppoeUsername._value": re },
    { "VirtualParameters.getSerialNumber._value": re },
    { "VirtualParameters.pppoeIP._value": q },
    { "VirtualParameters.IPTR069._value": q }
  ] };
  return { list: await nbiGet(cfg, "devices", query, PROJ, "&limit=" + (limit || 6)) };
}

async function formatDevice(cfg, d) {
  const online = d._lastInform && (Date.now() - new Date(d._lastInform).getTime()) < 15 * 60 * 1000;
  const ppp = val(d, "VirtualParameters.pppoeIP");
  const tr = val(d, "VirtualParameters.IPTR069");
  const w = await Promise.all([webCheck(ppp), webCheck(tr)]);
  const web = w.some((x) => x) ? "BISA" : (w.every((x) => x === null) ? "-" : "TERTUTUP");
  const faults = await nbiGet(cfg, "faults", { device: d._id }, ["channel", "code"]);
  const client = val(d, "VirtualParameters.activedevices");
  return [
    (online ? "🟢 ONLINE" : "🔴 OFFLINE") + "  " + (d._deviceId ? d._deviceId._Manufacturer + " " + d._deviceId._ProductClass : ""),
    "ID: " + d._id,
    "Pelanggan: " + (val(d, "VirtualParameters.pppoeUsername") || "-"),
    "SN: " + (val(d, "VirtualParameters.getSerialNumber") || "-") + "  FW: " + (val(d, "InternetGatewayDevice.DeviceInfo.SoftwareVersion") || "-"),
    "Last inform: " + ago(d._lastInform),
    "PON: " + (val(d, "VirtualParameters.getponmode") || "-") + "  RX: " + (val(d, "VirtualParameters.RXPower") || "-") + "  Suhu: " + (val(d, "VirtualParameters.gettemp") || "-"),
    "Uptime ONT: " + (val(d, "VirtualParameters.getdeviceuptime") || "-") + "  PPP: " + (val(d, "VirtualParameters.getpppuptime") || "-"),
    "IP PPPoE: " + (ppp || "-") + "  IP TR069: " + (tr || "-"),
    "Remote web: " + web,
    "WiFi aktif: " + (val(d, "VirtualParameters.ssidActive") || "-") + "  (client: " + (client !== undefined ? client : "-") + ")",
    "Fault: " + (faults.length ? faults.map((f) => f.channel + "/" + f.code).join(", ") : "tidak ada")
  ].join("\n") + await deviceDetail(cfg, d._id);
}

function keys(o) { return o ? Object.keys(o).filter((k) => k[0] !== "_").sort((a, b) => a - b) : []; }
function on(v) { return v === true || v === 1 || /^(true|1)$/i.test(String(v)); }
function firstVal(o, names) {
  for (const n of names) { const v = val(o, n); if (v !== undefined && v !== "") return v; }
  return undefined;
}

// Detail WAN dan SSID (tanpa password)
async function deviceDetail(cfg, id) {
  const base = "InternetGatewayDevice.";
  const docs = await nbiGet(cfg, "devices", { _id: id },
    [base + "WANDevice.1.WANConnectionDevice", base + "LANDevice.1.WLANConfiguration"]);
  const igd = docs[0] && docs[0].InternetGatewayDevice;
  if (!igd) return "";
  const out = [];

  const wcd = igd.WANDevice && igd.WANDevice["1"] && igd.WANDevice["1"].WANConnectionDevice;
  const wans = [];
  keys(wcd).forEach((i) => {
    ["WANPPPConnection", "WANIPConnection"].forEach((t) => {
      const o = wcd[i][t];
      keys(o).forEach((j) => {
        const x = o[j];
        const vlan = firstVal(x, ["X_ZTE-COM_VLANID", "X_HW_VLAN", "X_CMCC_VLANIDMark", "X_CT-COM_VLANIDMark", "X_FH_VlanId"]) ||
          firstVal(wcd[i], ["X_CT-COM_WANGponLinkConfig.VLANIDMark", "X_CMCC_WANEponLinkConfig.VLANIDMark", "X_CT-COM_WANEponLinkConfig.VLANIDMark"]);
        const ip = val(x, "ExternalIPAddress");
        wans.push("- " + (val(x, "Name") || (t + "." + j)) + " | " + (val(x, "ConnectionType") || "-") +
          (vlan !== undefined ? " | VLAN " + vlan : "") + " | " + (val(x, "ConnectionStatus") || (on(val(x, "Enable")) ? "aktif" : "mati")) +
          (ip && ip !== "0.0.0.0" ? " | " + ip : ""));
      });
    });
  });
  if (wans.length) out.push("", "🌐 WAN (" + wans.length + "):", wans.join("\n"));

  const wl = igd.LANDevice && igd.LANDevice["1"] && igd.LANDevice["1"].WLANConfiguration;
  const ssids = [];
  keys(wl).forEach((i) => {
    const x = wl[i];
    const name = val(x, "SSID");
    if (name === undefined) return;
    const enabled = on(val(x, "Enable"));
    const band = firstVal(x, ["OperatingFrequencyBand", "X_HW_RFBand", "Standard"]);
    const ch = val(x, "Channel");
    const sec = val(x, "BeaconType");
    const n = val(x, "TotalAssociations");
    ssids.push({ enabled, line: (enabled ? "✅ " : "⛔ ") + "[" + i + "] " + name +
      (band ? " | " + band : "") + (ch !== undefined ? " | ch " + ch : "") + (sec ? " | " + sec : "") +
      (enabled && n !== undefined ? " | " + n + " client" : "") });
  });
  if (ssids.length) {
    const act = ssids.filter((s) => s.enabled), off = ssids.length - act.length;
    out.push("", "📶 SSID aktif (" + act.length + "):", act.map((s) => s.line).join("\n") || "-");
    if (off) out.push("(" + off + " SSID lain nonaktif)");
  }
  return out.length ? "\n" + out.join("\n") : "";
}

// ---------- daftar ----------
function rxNum(d) {
  const v = parseFloat(String(val(d, "VirtualParameters.RXPower") || ""));
  return isFinite(v) ? v : null;
}
function shortLine(d) {
  return (val(d, "VirtualParameters.pppoeUsername") || "-") + " | " + (d._deviceId ? d._deviceId._ProductClass : "-") +
    " | " + (val(d, "VirtualParameters.RXPower") || "-");
}

async function cmdCari(cfg, q) {
  const r = await findDevices(cfg, q, 21);
  if (r.error) return r.error;
  if (!r.list.length) return "Tidak ditemukan: " + q;
  const now = Date.now();
  return "🔎 Hasil '" + q + "' (" + (r.list.length > 20 ? "20+" : r.list.length) + "):\n" + r.list.slice(0, 20).map((d) =>
    ((d._lastInform && now - new Date(d._lastInform).getTime() < 900000) ? "🟢 " : "🔴 ") + shortLine(d)).join("\n") +
    "\n\nDetail: /cek <username>";
}

async function cmdOffline(cfg) {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const list = await nbiGet(cfg, "devices", { _lastInform: { $lt: since } }, PROJ);
  if (!list.length) return "✅ Semua ONT online (inform < 15 menit).";
  list.sort((a, b) => new Date(b._lastInform) - new Date(a._lastInform));
  return "🔴 ONT offline (" + list.length + "), 25 terbaru putus:\n" + list.slice(0, 25).map((d) =>
    "- " + (val(d, "VirtualParameters.pppoeUsername") || d._id) + " | " + (d._deviceId ? d._deviceId._ProductClass : "-") + " | " + ago(d._lastInform)).join("\n");
}

async function cmdRedaman(cfg, limitArg) {
  const lim = parseFloat(limitArg) || -25;
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const list = (await nbiGet(cfg, "devices", { _lastInform: { $gt: since } }, PROJ))
    .filter((d) => { const v = rxNum(d); return v !== null && v < lim && v > -60; });
  if (!list.length) return "✅ Tidak ada ONT online dengan RX di bawah " + lim + " dBm.";
  list.sort((a, b) => rxNum(a) - rxNum(b));
  return "📉 RX di bawah " + lim + " dBm (" + list.length + " ONT), terburuk dulu:\n" + list.slice(0, 30).map((d) =>
    "- " + rxNum(d) + " dBm | " + (val(d, "VirtualParameters.pppoeUsername") || d._id) + " | " + (d._deviceId ? d._deviceId._ProductClass : "-")).join("\n");
}

async function cmdCek(cfg, q) {
  const r = await findDevices(cfg, q);
  if (r.error) return r.error;
  if (!r.list.length) return "Tidak ditemukan: " + q;
  if (r.list.length > 1) {
    return "Ditemukan " + (r.list.length > 5 ? "lebih dari 5" : r.list.length) + " ONT, perjelas kata kunci:\n" +
      r.list.slice(0, 5).map((d) => "- " + (val(d, "VirtualParameters.pppoeUsername") || "-") + "  (" + d._id + ")").join("\n");
  }
  return formatDevice(cfg, r.list[0]);
}

async function cmdStatus(cfg) {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const all = await nbiGet(cfg, "devices", {}, ["_id"]);
  const online = await nbiGet(cfg, "devices", { _lastInform: { $gt: since } }, ["_id"]);
  const faults = await nbiGet(cfg, "faults", {}, ["code"]);
  const byCode = {};
  faults.forEach((f) => { byCode[f.code] = (byCode[f.code] || 0) + 1; });
  let report = "-";
  try {
    const lines = fs.readFileSync(REPORT_LOG, "utf8").trim().split("\n").filter((l) => l.indexOf("=====") === 0);
    if (lines.length) report = lines[lines.length - 1].replace(/^=+\s*/, "");
  } catch (e) { /* belum ada log */ }
  return [
    "📊 Status GenieACS",
    "Total ONT: " + all.length,
    "Online (15 menit): " + online.length,
    "Fault: " + faults.length + (faults.length ? " (" + Object.keys(byCode).map((k) => k + "=" + byCode[k]).join(", ") + ")" : ""),
    "Laporan remote web Huawei terakhir: " + report
  ].join("\n");
}

async function cmdFault(cfg) {
  const faults = await nbiGet(cfg, "faults", {}, ["device", "channel", "code", "message", "timestamp"]);
  if (!faults.length) return "✅ Tidak ada fault.";
  faults.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return "⚠️ Fault (" + faults.length + "), 15 terbaru:\n" + faults.slice(0, 15).map((f) =>
    "- " + ago(f.timestamp) + " | " + f.device + " | " + f.channel + " | " + f.code + (f.message ? " | " + String(f.message).slice(0, 80) : "")).join("\n");
}

// ---------- TAHAP 2: ubah SSID / password WiFi (dengan konfirmasi) ----------
const AUDIT_LOG = path.join(__dirname, "audit.log");
const PENDING = {};            // key -> aksi menunggu konfirmasi
const PENDING_TTL = 5 * 60 * 1000;

function audit(line) {
  try { fs.appendFileSync(AUDIT_LOG, new Date().toISOString() + " " + line + "\n"); } catch (e) { log("audit gagal", e.message); }
}

async function findOne(cfg, q) {
  const r = await findDevices(cfg, q);
  if (r.error) return { error: r.error };
  if (!r.list.length) return { error: "Tidak ditemukan: " + q };
  if (r.list.length > 1) {
    return { error: "Kata kunci cocok dengan beberapa ONT. Pakai SN atau ID yang lebih spesifik:\n" +
      r.list.slice(0, 5).map((d) => "- " + (val(d, "VirtualParameters.pppoeUsername") || "-") + "  SN " + (val(d, "VirtualParameters.getSerialNumber") || "-")).join("\n") };
  }
  return { dev: r.list[0] };
}

// Daftar SSID beserta parameter password yang benar-benar ada di ONT ini
async function wlanList(cfg, id) {
  const docs = await nbiGet(cfg, "devices", { _id: id }, ["InternetGatewayDevice.LANDevice.1.WLANConfiguration"]);
  const igd = docs[0] && docs[0].InternetGatewayDevice;
  const wl = igd && igd.LANDevice && igd.LANDevice["1"] && igd.LANDevice["1"].WLANConfiguration;
  return keys(wl).map((i) => {
    const x = wl[i];
    let passParam = null;
    if (x.PreSharedKey && x.PreSharedKey["1"] && x.PreSharedKey["1"].KeyPassphrase) passParam = "PreSharedKey.1.KeyPassphrase";
    else if (x.KeyPassphrase) passParam = "KeyPassphrase";
    return {
      idx: i, ssid: val(x, "SSID"), enabled: on(val(x, "Enable")),
      band: firstVal(x, ["OperatingFrequencyBand", "X_HW_RFBand", "Standard"]),
      security: val(x, "BeaconType"), clients: val(x, "TotalAssociations"),
      hasSsid: !!x.SSID, passParam: passParam
    };
  }).filter((w) => w.ssid !== undefined);
}

function ssidLine(w) {
  return (w.enabled ? "✅" : "⛔") + " [" + w.idx + "] " + w.ssid + (w.band ? " | " + w.band : "") +
    (w.security ? " | " + w.security : "") + (w.enabled && w.clients !== undefined ? " | " + w.clients + " client" : "");
}

async function cmdSsid(cfg, q) {
  const r = await findOne(cfg, q);
  if (r.error) return r.error;
  const d = r.dev;
  const wl = await wlanList(cfg, d._id);
  if (!wl.length) return "ONT ini belum punya data SSID di GenieACS.";
  const act = wl.filter((w) => w.enabled), off = wl.filter((w) => !w.enabled);
  const sn = val(d, "VirtualParameters.getSerialNumber") || d._id;
  return [
    "📶 SSID " + (val(d, "VirtualParameters.pppoeUsername") || "-") + " (" + (d._deviceId ? d._deviceId._ProductClass : "-") + ", SN " + sn + ")",
    "", "Aktif (" + act.length + "):", act.map(ssidLine).join("\n") || "-",
    off.length ? "\nNonaktif (" + off.length + "):\n" + off.map(ssidLine).join("\n") : "",
    "", "Ubah nama : /ubahssid " + sn + " <nomor> <nama baru>",
    "Ubah pass : /ubahpass " + sn + " <nomor> <password baru>",
    "Contoh    : /ubahssid " + sn + " " + (act[0] ? act[0].idx : 1) + " RumahKu"
  ].join("\n");
}

// Siapkan perubahan -> kirim tombol konfirmasi
async function prepareChange(cfg, chatId, kind, q, idx, value) {
  if (!cfg.actionsEnabled) return { text: "Aksi ubah SSID/password sedang dimatikan (Admin -> Config: bot.actions.enabled)." };
  if (kind === "ssid") {
    if (!value || value.length > 32 || /[\x00-\x1f\x7f]/.test(value)) return { text: "Nama SSID harus 1-32 karakter tanpa karakter kontrol." };
  } else {
    if (value.length < 8 || value.length > 63 || !/^[\x20-\x7e]+$/.test(value)) return { text: "Password WiFi harus 8-63 karakter (huruf, angka, simbol biasa)." };
  }
  const r = await findOne(cfg, q);
  if (r.error) return { text: r.error };
  const d = r.dev;
  const w = (await wlanList(cfg, d._id)).find((x) => x.idx === String(idx));
  if (!w) return { text: "SSID nomor " + idx + " tidak ada di ONT ini. Lihat daftar: /ssid " + q };
  const param = kind === "ssid" ? (w.hasSsid ? "SSID" : null) : w.passParam;
  if (!param) return { text: "ONT ini tidak menyediakan parameter " + (kind === "ssid" ? "nama SSID" : "password") + " untuk SSID " + idx + "." };
  const key = Math.random().toString(36).slice(2, 10);
  PENDING[key] = { chatId, deviceId: d._id, user: val(d, "VirtualParameters.pppoeUsername") || d._id, idx: w.idx, oldSsid: w.ssid,
    kind, path: "InternetGatewayDevice.LANDevice.1.WLANConfiguration." + w.idx + "." + param, value, created: Date.now() };
  const what = kind === "ssid" ? "nama SSID [" + w.idx + "] '" + w.ssid + "' -> '" + value + "'"
    : "password SSID [" + w.idx + "] '" + w.ssid + "' (" + value.length + " karakter)";
  let warn = "";
  if (kind === "pass" && /^(none|basic)$/i.test(String(w.security || ""))) warn = "\n⚠️ SSID ini tanpa keamanan (" + w.security + "): password tidak berlaku sampai mode keamanan diaktifkan.";
  if (w.enabled && w.clients) warn += "\n⚠️ " + w.clients + " perangkat akan terputus dan perlu login ulang.";
  return {
    text: "Konfirmasi perubahan untuk " + PENDING[key].user + ":\n" + what + warn + "\n\nBerlaku 5 menit.",
    keyboard: { inline_keyboard: [[{ text: "✅ Ya, ubah", callback_data: "ok:" + key }, { text: "❌ Batal", callback_data: "no:" + key }]] }
  };
}

// Reboot ONT: hanya menyiapkan konfirmasi
async function prepareReboot(cfg, chatId, q) {
  if (!cfg.actionsEnabled) return { text: "Aksi reboot sedang dimatikan (Admin -> Config: bot.actions.enabled)." };
  const r = await findOne(cfg, q);
  if (r.error) return { text: r.error };
  const d = r.dev;
  const online = d._lastInform && (Date.now() - new Date(d._lastInform).getTime()) < 15 * 60 * 1000;
  const key = Math.random().toString(36).slice(2, 10);
  const user = val(d, "VirtualParameters.pppoeUsername") || d._id;
  PENDING[key] = { chatId, deviceId: d._id, user, kind: "reboot", created: Date.now() };
  const client = val(d, "VirtualParameters.activedevices");
  return {
    text: "Konfirmasi REBOOT ONT " + user + " (" + (d._deviceId ? d._deviceId._ProductClass : "-") + ")\n" +
      "Status: " + (online ? "online" : "OFFLINE, perintah baru jalan saat ONT tersambung") + " | uptime " + (val(d, "VirtualParameters.getdeviceuptime") || "-") + "\n" +
      "⚠️ Internet & WiFi pelanggan putus sekitar 2 menit" + (client ? " (" + client + " perangkat sedang terhubung)" : "") + ".\n\nBerlaku 5 menit.",
    keyboard: { inline_keyboard: [[{ text: "🔄 Ya, reboot", callback_data: "ok:" + key }, { text: "❌ Batal", callback_data: "no:" + key }]] }
  };
}

// Refresh: minta ONT kirim data terbaru (tidak mengubah konfigurasi ONT)
async function cmdRefresh(cfg, chatId, q) {
  const r = await findOne(cfg, q);
  if (r.error) return r.error;
  const d = r.dev;
  const names = ["VirtualParameters.RXPower", "VirtualParameters.gettemp", "VirtualParameters.getdeviceuptime",
    "VirtualParameters.getpppuptime", "VirtualParameters.pppoeIP", "VirtualParameters.IPTR069",
    "VirtualParameters.activedevices", "VirtualParameters.ssidActive"];
  const url = cfg.nbi + "/devices/" + encodeURIComponent(d._id) + "/tasks?connection_request&timeout=30000";
  const body = JSON.stringify({ name: "getParameterValues", parameterNames: names });
  const res = await request(url, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, body);
  audit("REFRESH " + chatId + " " + d._id + " => HTTP " + res.status);
  if (res.status === 202) {
    // ONT tidak menjawab: batalkan task supaya tidak menumpuk, tampilkan data terakhir
    let t = {};
    try { t = JSON.parse(res.body); } catch (e) { /* kosong */ }
    if (t._id) await request(cfg.nbi + "/tasks/" + t._id, { method: "DELETE" }).catch(() => {});
    return "⏳ ONT tidak menjawab (mungkin offline / connection request diblokir). Data terakhir:\n\n" + await formatDevice(cfg, d);
  }
  if (res.status !== 200) return "❌ Refresh gagal (HTTP " + res.status + ").";
  const fresh = (await nbiGet(cfg, "devices", { _id: d._id }, PROJ))[0] || d;
  return "🔄 Data terbaru:\n\n" + await formatDevice(cfg, fresh);
}

async function executeChange(cfg, p) {
  const url = cfg.nbi + "/devices/" + encodeURIComponent(p.deviceId) + "/tasks?connection_request&timeout=30000";
  if (p.kind === "reboot") {
    const rb = JSON.stringify({ name: "reboot" });
    const rr = await request(url, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(rb) } }, rb);
    if (rr.status === 200) return "🔄 Perintah reboot diterima ONT " + p.user + ". ONT kembali online biasanya dalam 2-3 menit (cek: /cek " + p.user + ").";
    if (rr.status === 202) return "⏳ ONT " + p.user + " belum menjawab. Reboot dijalankan saat ONT inform berikutnya.";
    return "❌ Gagal mengirim reboot (HTTP " + rr.status + ").";
  }
  const body = JSON.stringify({ name: "setParameterValues", parameterValues: [[p.path, p.value, "xsd:string"]] });
  const r = await request(url, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, body);
  let task = {};
  try { task = JSON.parse(r.body); } catch (e) { /* kosong */ }
  if (r.status === 202) return "⏳ Perintah dikirim, ONT belum menjawab. Akan diterapkan saat ONT inform berikutnya (maks ~5 menit).";
  if (r.status !== 200) return "❌ Gagal mengirim perintah (HTTP " + r.status + ").";
  const fault = task._id ? await nbiGet(cfg, "faults", { _id: p.deviceId + ":task_" + task._id }, ["code", "message"]) : [];
  if (fault.length) return "❌ ONT menolak perubahan: " + fault[0].code + " " + (fault[0].message || "");
  return "✅ Berhasil. " + (p.kind === "ssid" ? "Nama SSID [" + p.idx + "] sekarang '" + p.value + "'." : "Password SSID [" + p.idx + "] '" + p.oldSsid + "' sudah diganti.");
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

// ---------- TAHAP 3: asisten AI (Claude), HANYA BACA ----------
const CWMP_LOG = "/var/log/genieacs/genieacs-cwmp-access.log";
const SENSITIVE = /pass|key|secret|token|psk|wep|credential/i;

const AI_SYSTEM = [
  "Kamu asisten teknis NOC untuk ISP kecil yang mengelola ONT/modem pelanggan lewat GenieACS (TR-069).",
  "Jawab dalam Bahasa Indonesia, singkat dan praktis, untuk teknisi lewat Telegram (teks biasa, tanpa markdown tabel).",
  "",
  "Kamu hanya bisa MEMBACA data lewat tools. Kamu tidak bisa mengubah apa pun di ONT atau GenieACS.",
  "Jika perbaikan diperlukan, jelaskan langkahnya; untuk perubahan yang tersedia di bot sebutkan perintahnya",
  "(/ubahssid, /ubahpass, /reboot, /refresh - semua meminta konfirmasi admin). Perubahan lain dilakukan admin manual.",
  "Jangan pernah menampilkan password, kunci, atau token, dan jangan menebak nilainya.",
  "Selalu cek data lewat tools sebelum menyimpulkan; bedakan fakta dari dugaan.",
  "",
  "Konteks jaringan:",
  "- Merk ONT: Huawei (HG8145V5, EG8041V5, HG8245H5, dll), ZTE (F670L, F679D, F663NV3A, F609), FiberHome (HG6145D2, HG6045F3), Nokia/ALCL (G-1425G-H), C-Data, CIOT.",
  "- VLAN: 1010 = TR069/manajemen, 30 = internet PPPoE, 151 = layanan lain/bridge.",
  "- ONT 'online' bila inform terakhir < 15 menit (interval inform 300 detik).",
  "- RX power: >= -18 dBm bagus, -18..-25 lumayan, < -25 buruk.",
  "- Remote web dibuka lewat provision 'remoteweb'. Penyebab umum tertutup: Huawei HG8145V5 aturan ACL AccessControl blokir HTTP dari WAN atau WanAccess kosong; FiberHome perlu X_FH_ACL Rule Direction 0 dan 1 (HG6045F3 RP3441 juga RemoteAccess); ZTE F670L perlu IPV4ServiceControl HTTP WAN_ALL; ZTE F663NV3A firmware CMCC dengan WAN gabungan TR069+INTERNET tidak bisa dibuka lewat TR-069.",
  "- ZTE F670L di OLT C-Data: WAN dari OLT lewat OMCI (nama omci_ipv4_*); PPPoE ditambah lewat TR-069 di WANConnectionDevice.1 dengan ConnectionType diset dulu.",
  "- Fault umum: too_many_commits (provision berulang), cwmp.9002/9003/9005/9007 (ONT menolak parameter), session_terminated."
].join("\n");

const AI_TOOLS = [
  { name: "cari_ont", description: "Cari ONT berdasarkan username PPPoE (sebagian), SN, IP, atau ID. Mengembalikan daftar maksimal 20 ONT dengan status online dan RX.",
    input_schema: { type: "object", properties: { kata: { type: "string", description: "kata kunci, min 3 huruf/angka" } }, required: ["kata"], additionalProperties: false } },
  { name: "detail_ont", description: "Detail satu ONT: status, model, firmware, RX, suhu, uptime, IP, remote web (dicek langsung), daftar WAN, SSID, fault.",
    input_schema: { type: "object", properties: { kata: { type: "string", description: "username/SN/IP/ID yang spesifik" } }, required: ["kata"], additionalProperties: false } },
  { name: "baca_parameter", description: "Baca parameter TR-069 mentah dari satu ONT di bawah prefix tertentu (misal 'InternetGatewayDevice.X_HW_Security' atau 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice'). Nilai rahasia disembunyikan. Data dari database GenieACS (bisa sedikit tertinggal).",
    input_schema: { type: "object", properties: { kata: { type: "string" }, prefix: { type: "string", description: "awalan path parameter, mulai dari InternetGatewayDevice atau VirtualParameters" } }, required: ["kata", "prefix"], additionalProperties: false } },
  { name: "log_ont", description: "40 baris terakhir log CWMP GenieACS untuk satu ONT (inform, perintah ACS, CPE fault, channel fault).",
    input_schema: { type: "object", properties: { kata: { type: "string" } }, required: ["kata"], additionalProperties: false } },
  { name: "daftar_fault", description: "Daftar fault GenieACS terbaru (semua ONT).", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "status_ringkas", description: "Ringkasan GenieACS: total ONT, online, jumlah fault, laporan remote web Huawei terakhir.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "ont_offline", description: "Daftar ONT yang tidak inform lebih dari 15 menit.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "ont_redaman", description: "Daftar ONT online dengan RX di bawah batas dBm.",
    input_schema: { type: "object", properties: { batas: { type: "number", description: "default -25" } }, additionalProperties: false } },
  { name: "laporan_remoteweb", description: "Hasil laporan otomatis remote web Huawei terakhir (ONT yang web-nya tertutup dan penyebabnya).", input_schema: { type: "object", properties: {}, additionalProperties: false } }
];

async function aiBacaParameter(cfg, kata, prefix) {
  if (!/^(InternetGatewayDevice|Device|VirtualParameters)(\.|$)/.test(prefix || "")) return "prefix harus diawali InternetGatewayDevice, Device, atau VirtualParameters";
  const r = await findOne(cfg, kata);
  if (r.error) return r.error;
  const docs = await nbiGet(cfg, "devices", { _id: r.dev._id }, [prefix.replace(/\.$/, "")]);
  const out = [];
  (function walk(o, p) {
    keys(o).forEach((k) => {
      const c = o[k], path = p ? p + "." + k : k;
      if (!c || typeof c !== "object" || out.length >= 150) return;
      if (Object.prototype.hasOwnProperty.call(c, "_value")) {
        out.push(path + " = " + (SENSITIVE.test(k) ? "(disembunyikan)" : JSON.stringify(c._value)) + (c._writable ? "" : " [ro]"));
      }
      walk(c, path);
    });
  })(docs[0] || {}, "");
  return out.length ? r.dev._id + "\n" + out.join("\n") + (out.length >= 150 ? "\n...(dipotong 150 baris)" : "") : "Tidak ada parameter di bawah " + prefix + " (mungkin belum pernah dibaca dari ONT).";
}

function aiLogOnt(id) {
  try {
    const out = execFileSync("bash", ["-c", 'grep -F -- "$1" "$2" | tail -n 40', "_", id, CWMP_LOG], { encoding: "utf8", timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
    return out.split("\n").map((l) => l.replace(/^(\S+) \[INFO\] |\[WARN\] /, "$1 ").replace(/::ffff:\S+ /, "").replace(id + ": ", "").slice(0, 220)).join("\n") || "(tidak ada log)";
  } catch (e) { return "gagal membaca log: " + e.message; }
}

async function aiRunTool(cfg, name, input) {
  input = input || {};
  switch (name) {
    case "cari_ont": return cmdCari(cfg, String(input.kata || ""));
    case "detail_ont": return cmdCek(cfg, String(input.kata || ""));
    case "baca_parameter": return aiBacaParameter(cfg, String(input.kata || ""), String(input.prefix || ""));
    case "log_ont": { const r = await findOne(cfg, String(input.kata || "")); return r.error ? r.error : aiLogOnt(r.dev._id); }
    case "daftar_fault": return cmdFault(cfg);
    case "status_ringkas": return cmdStatus(cfg);
    case "ont_offline": return cmdOffline(cfg);
    case "ont_redaman": return cmdRedaman(cfg, input.batas !== undefined ? String(input.batas) : "");
    case "laporan_remoteweb": {
      try {
        const t = fs.readFileSync(REPORT_LOG, "utf8").trim().split("\n");
        let i = t.length - 1; while (i > 0 && t[i].indexOf("=====") !== 0) i--;
        return t.slice(i).join("\n");
      } catch (e) { return "laporan belum ada"; }
    }
    default: return "tool tidak dikenal: " + name;
  }
}

// fallback otomatis saat model menolak hanya didukung model tertentu
function aiFallbackOk(model) { return /^claude-(opus-5|fable-5|sonnet-5-5)/.test(model); }

async function claude(cfg, body) {
  const headers = { "Content-Type": "application/json", "x-api-key": cfg.aiApiKey, "anthropic-version": "2023-06-01" };
  if (aiFallbackOk(body.model)) { body.fallbacks = "default"; headers["anthropic-beta"] = "server-side-fallback-2026-07-01"; }
  const payload = JSON.stringify(body);
  headers["Content-Length"] = Buffer.byteLength(payload);
  const r = await request("https://api.anthropic.com/v1/messages", { method: "POST", timeout: 180000, headers: headers }, payload);
  let j = {};
  try { j = JSON.parse(r.body); } catch (e) { /* bukan JSON */ }
  if (r.status !== 200) throw new Error("API AI HTTP " + r.status + ": " + ((j.error && j.error.message) || r.body.slice(0, 200)));
  return j;
}

// batas harian (biaya)
function aiQuotaOk(cfg) {
  const st = loadState(), today = new Date().toISOString().slice(0, 10);
  if (st.aiDay !== today) { st.aiDay = today; st.aiCount = 0; }
  if (st.aiCount >= cfg.aiDailyLimit) return false;
  st.aiCount++; saveState(st);
  return true;
}

async function cmdTanya(cfg, chatId, question) {
  if (!cfg.aiEnabled) return "Asisten AI belum aktif (Admin -> Config: bot.ai.enabled = 'true' dan isi bot.ai.apiKey).";
  if (!cfg.aiApiKey) return "API key AI belum diisi (Admin -> Config: bot.ai.apiKey).";
  if (!question || question.length < 5) return "Pakai: /tanya <pertanyaan>\nContoh: /tanya kenapa ONT budi@rw01 tidak bisa remote web?";
  if (!aiQuotaOk(cfg)) return "Batas pertanyaan AI hari ini (" + cfg.aiDailyLimit + ") sudah tercapai. Ubah di bot.ai.dailyLimit.";
  audit("TANYA " + chatId + " " + JSON.stringify(question.slice(0, 200)));
  const messages = [{ role: "user", content: question }];
  let usedTools = 0, inTok = 0, outTok = 0;
  for (let step = 0; step < 10; step++) {
    const res = await claude(cfg, {
      model: cfg.aiModel, max_tokens: 16000,
      system: AI_SYSTEM, tools: AI_TOOLS, messages: messages,
      output_config: { effort: "medium" },
      cache_control: { type: "ephemeral" }
    });
    if (res.usage) { inTok += res.usage.input_tokens || 0; outTok += res.usage.output_tokens || 0; }
    if (res.stop_reason === "refusal") return "AI menolak menjawab pertanyaan ini.";
    // kirim balik konten asisten utuh (termasuk blok thinking) agar percakapan valid
    messages.push({ role: "assistant", content: res.content });
    const calls = (res.content || []).filter((b) => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !calls.length) {
      const text = (res.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      log("AI selesai: tools=" + usedTools + " in=" + inTok + " out=" + outTok + " stop=" + res.stop_reason);
      return (text || "(AI tidak memberi jawaban)") + (res.stop_reason === "max_tokens" ? "\n\n(jawaban terpotong)" : "");
    }
    const results = await Promise.all(calls.map(async (c) => {
      usedTools++;
      let out, isErr = false;
      try { out = String(await aiRunTool(cfg, c.name, c.input)); } catch (e) { out = "error: " + e.message; isErr = true; }
      return { type: "tool_result", tool_use_id: c.id, content: out.slice(0, 12000), is_error: isErr };
    }));
    messages.push({ role: "user", content: results });
  }
  return "AI butuh terlalu banyak langkah; coba perjelas pertanyaannya.";
}

const HELP = [
  "🤖 Bot GenieACS",
  "",
  "/cek <kata kunci>  - detail 1 ONT: status, sinyal, WAN, SSID, fault",
  "/ssid <kata kunci> - daftar SSID (aktif & nonaktif) + nomornya",
  "/ubahssid <kata kunci> <nomor> <nama baru>      - ganti nama SSID",
  "/ubahpass <kata kunci> <nomor> <password baru>  - ganti password WiFi",
  "/refresh <kata kunci> - ambil data terbaru dari ONT (seperti Summon)",
  "/reboot <kata kunci>  - restart ONT (dengan konfirmasi)",
  "/tanya <pertanyaan>   - tanya asisten AI (analisa, hanya membaca data)",
  "/cari <kata>       - daftar ONT yang cocok (maks 20)",
  "/offline           - ONT yang tidak inform > 15 menit",
  "/redaman [batas]   - ONT dengan RX di bawah batas (default -25 dBm)",
  "/status            - ringkasan GenieACS",
  "/fault             - daftar fault terbaru",
  "/id                - chat ID Anda",
  "",
  "Kata kunci: username PPPoE (lengkap/sebagian), SN ONT, IP PPPoE/TR069, atau ID device.",
  "Contoh: /cek budi@rw01  |  /cek ZTEGXXXXXXXX  |  /cari rw01  |  /redaman -27",
  "Bisa juga langsung kirim kata kunci tanpa perintah."
].join("\n");

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
    else if (cmd === "/start" || cmd === "/help" || cmd === "/menu") out = HELP;
    else if (cmd === "/cek") out = arg ? await cmdCek(cfg, arg) : "Pakai: /cek <username/SN/IP>";
    else if (cmd === "/status") out = await cmdStatus(cfg);
    else if (cmd === "/fault") out = await cmdFault(cfg);
    else if (cmd === "/cari") out = arg ? await cmdCari(cfg, arg) : "Pakai: /cari <kata>";
    else if (cmd === "/offline") out = await cmdOffline(cfg);
    else if (cmd === "/redaman") out = await cmdRedaman(cfg, arg);
    else if (cmd[0] === "/") out = "Perintah tidak dikenal.\n\n" + HELP;
    else out = await cmdCek(cfg, text);
  } catch (e) {
    log("ERROR", e.message);
    out = "Gagal: " + e.message;
  }
  if (keyboard) return tg(cfg, "sendMessage", { chat_id: chatId, text: out, reply_markup: keyboard });
  return send(cfg, chatId, out);
}

// ---------- alert lonjakan fault (baca saja) ----------
function loadState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch (e) { return {}; } }
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s)); }

async function checkAlerts(cfg) {
  if (!cfg.alertChatIds.length) return;
  const st = loadState();
  const since = st.lastAlertCheck || new Date(Date.now() - cfg.alertEveryMinutes * 60000).toISOString();
  st.lastAlertCheck = new Date().toISOString();
  const fresh = await nbiGet(cfg, "faults", { timestamp: { $gt: since } }, ["code"]);
  saveState(st);
  if (fresh.length < cfg.alertFaultThreshold) return;
  const byCode = {};
  fresh.forEach((f) => { byCode[f.code] = (byCode[f.code] || 0) + 1; });
  const text = "🚨 Lonjakan fault: " + fresh.length + " fault baru dalam " + cfg.alertEveryMinutes + " menit\n" +
    Object.keys(byCode).map((k) => "- " + k + ": " + byCode[k]).join("\n") + "\nCek: /fault";
  for (const id of cfg.alertChatIds) await send(cfg, id, text).catch((e) => log("alert gagal", e.message));
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
    else if (what === "help") console.log(HELP);
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
      const k = Object.keys(PENDING)[0];
      console.log(res.text + (k ? "\n[selftest] parameter yang akan diubah: " + PENDING[k].path : ""));
    }
    else if (what === "config") console.log(JSON.stringify({ enabled: cfg.enabled, tokenSet: !!cfg.token, allowedChatIds: cfg.allowedChatIds, alertChatIds: cfg.alertChatIds, alertEveryMinutes: cfg.alertEveryMinutes, alertFaultThreshold: cfg.alertFaultThreshold }));
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
      Object.keys(PENDING).forEach((k) => { if (Date.now() - PENDING[k].created > PENDING_TTL) delete PENDING[k]; });
    } catch (e) {
      log("polling", e.message);
      await sleep(5000);
    }
    if (Date.now() - lastAlert > cfg.alertEveryMinutes * 60000) {
      lastAlert = Date.now();
      await checkAlerts(cfg).catch((e) => log("alert", e.message));
    }
  }
}

main().catch((e) => { log("FATAL", e.stack || e.message); process.exit(1); });
