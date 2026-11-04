#!/usr/bin/env node
// Portal Mandiri WiFi pelanggan (https://<domain>:3020/). Pelanggan login dengan nomor HP + OTP WhatsApp lalu bisa
// mengganti nama/sandi WiFi, restart modem, dan melihat redaman -- HANYA untuk ONT miliknya. Lihat docs/PORTAL-WIFI.md.
//
// Keamanan (ringkas; rinciannya di docs):
//  - OTP wajib (6 digit, berlaku 5 menit, 3 kali tebak, disimpan sebagai hash), tidak ada mode tanpa OTP.
//  - Nomor harus cocok TEPAT satu ONT lewat tag nomor di GenieACS. Respons "minta OTP" selalu sama, terdaftar atau tidak.
//  - Batas laju per IP dan per nomor; sesi acak 256-bit di memori, terikat ke satu ONT; ID ONT tidak pernah diterima dari browser.
//  - Aksi dibatasi: nama WiFi, sandi WiFi (8-63), restart, baca redaman. Tidak ada akses admin web ONT, WAN, dsb.
// Pengiriman OTP lewat bot WhatsApp (outbox di Config portal.out.*). Tanpa dependensi npm; kompatibel Node 12+.
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const core = require("./core.js");
const { log, audit, val, nbiGet, wlanList, executeChange, readGenieConfig } = core;

// ---------- util ----------
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
function rnd6() { let n; do { n = crypto.randomBytes(4).readUInt32BE(0); } while (n >= 4294000000); return String(n % 1000000).padStart(6, "0"); }
function safeEq(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }

// 0812.. / +62 812.. / 62812.. / 812.. -> 62812..; bukan nomor -> ""
function normPhone(s) {
  let d = String(s || "").replace(/[\s().-]/g, "");
  if (!/^\+?[0-9]{8,15}$/.test(d)) return "";
  d = d.replace(/^\+/, "");
  if (d.indexOf("62") === 0) return d.length >= 10 && d.length <= 15 ? d : "";
  if (d[0] === "0") d = "62" + d.slice(1);
  else if (d[0] === "8") d = "62" + d;
  else return "";
  return d.length >= 10 && d.length <= 15 ? d : "";
}
// tag ONT yang dianggap nomor: "081234", "wa:081234", "hp:+62 812-34", "wa_62812.."; tag lain (LOC_..., ODP_..., VIP) diabaikan
function tagPhone(tag) {
  const t = String(tag || "").trim().replace(/^(wa|hp|phone|telp|no)[:_\s]+/i, "");
  return /^\+?[0-9][0-9 .-]{6,18}$/.test(t) ? normPhone(t) : "";
}

// ---------- batas laju ----------
function limiter(max, windowMs) {
  const m = new Map();
  return {
    hit(key, now) {
      const a = (m.get(key) || []).filter((t) => now - t < windowMs);
      if (a.length >= max) { m.set(key, a); return false; }
      a.push(now); m.set(key, a); return true;
    },
    sweep(now) { m.forEach((a, k) => { const f = a.filter((t) => now - t < windowMs); if (f.length) m.set(k, f); else m.delete(k); }); }
  };
}

// ---------- inti (bisa diuji tanpa jaringan) ----------
// deps: { nbi, send(phone62, text) -> Promise, now() , settings() -> {...}, run(cfg, entry) opsional }
function createPortal(deps) {
  const now = deps.now || Date.now;
  const S = () => Object.assign({ enabled: true, otpMinutes: 5, sessionMinutes: 30, maxActionsPerDay: 10, brand: "WiFi", csNumber: "" }, deps.settings ? deps.settings() : {});
  const cfg = { nbi: deps.nbi };
  const otps = new Map();        // phone -> {hash, exp, tries, dev, sentAt}
  const sessions = new Map();    // token hash -> {dev, phone, exp, day, n}
  const lIp = limiter(10, 10 * 60000), lPhone = limiter(3, 10 * 60000), lVerifyIp = limiter(20, 10 * 60000), lAct = limiter(12, 60000);
  let idx = { at: 0, map: new Map() };

  async function phoneIndex() {
    if (now() - idx.at < 60000) return idx.map;
    const docs = await nbiGet(cfg, "devices", {}, ["_id", "_tags", "VirtualParameters.pppoeUsername"]);
    const map = new Map();
    docs.forEach((d) => (d._tags || []).forEach((t) => {
      const p = tagPhone(t); if (!p) return;
      const a = map.get(p) || []; if (a.indexOf(d._id) < 0) a.push(d._id); map.set(p, a);
    }));
    idx = { at: now(), map };
    return map;
  }

  const GENERIC = { ok: true, message: "Jika nomor terdaftar, kode OTP dikirim lewat WhatsApp." };

  async function requestOtp(ip, phoneRaw) {
    const s = S(); if (!s.enabled) return { status: 503, body: { ok: false, message: "Portal belum diaktifkan." } };
    const t = now();
    if (!lIp.hit(ip, t)) return { status: 429, body: { ok: false, message: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." } };
    const phone = normPhone(phoneRaw);
    if (!phone) return { status: 400, body: { ok: false, message: "Format nomor tidak valid." } };
    const old = otps.get(phone);
    if (old && t - old.sentAt < 60000) return { status: 200, body: GENERIC };   // jeda kirim ulang 60 detik (tidak memakai jatah)
    if (!lPhone.hit(phone, t)) return { status: 200, body: GENERIC };      // maks 3 OTP per nomor / 10 menit: diam-diam, respons tetap sama
    let devs = [];
    try { devs = (await phoneIndex()).get(phone) || []; } catch (e) { log("portal: NBI gagal:", e.message); return { status: 503, body: { ok: false, message: "Layanan sedang sibuk, coba lagi." } }; }
    if (devs.length === 1) {
      const code = rnd6();
      otps.set(phone, { hash: sha(phone + ":" + code), exp: t + s.otpMinutes * 60000, tries: 0, dev: devs[0], sentAt: t });
      try { await deps.send(phone, "Kode OTP " + s.brand + ": *" + code + "*\nBerlaku " + s.otpMinutes + " menit. Jangan berikan kode ini kepada siapa pun."); audit("PORTAL otp-kirim ***" + phone.slice(-4)); }
      catch (e) { otps.delete(phone); log("portal: kirim OTP gagal:", e.message); }
    } else if (devs.length > 1) audit("PORTAL nomor-ganda ***" + phone.slice(-4) + " cocok " + devs.length + " ONT (ditolak)");
    return { status: 200, body: GENERIC };
  }

  function verifyOtp(ip, phoneRaw, code) {
    const t = now(), BAD = { status: 401, body: { ok: false, message: "Kode salah atau kedaluwarsa." } };
    if (!lVerifyIp.hit(ip, t)) return { status: 429, body: { ok: false, message: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." } };
    const phone = normPhone(phoneRaw), e = otps.get(phone);
    if (!e || t > e.exp || !/^[0-9]{6}$/.test(String(code || ""))) { if (e && t > e.exp) otps.delete(phone); return BAD; }
    e.tries++;
    if (e.tries > 3) { otps.delete(phone); return BAD; }
    if (!safeEq(e.hash, sha(phone + ":" + code))) { if (e.tries >= 3) otps.delete(phone); return BAD; }
    otps.delete(phone);
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(sha(token), { dev: e.dev, phone, exp: t + S().sessionMinutes * 60000, day: new Date(t).toDateString(), n: 0 });
    audit("PORTAL login ***" + phone.slice(-4) + " " + e.dev);
    return { status: 200, body: { ok: true, token } };
  }

  function session(token) {
    const k = sha(token || ""), s = sessions.get(k);
    if (!s) return null;
    if (now() > s.exp) { sessions.delete(k); return null; }
    return s;
  }

  async function me(token) {
    const s = session(token); if (!s) return { status: 401, body: { ok: false, message: "Sesi berakhir. Masuk lagi." } };
    const docs = await nbiGet(cfg, "devices", { _id: s.dev }, ["_lastInform", "_deviceId", "VirtualParameters.pppoeUsername", "VirtualParameters.RXPower"]);
    const d = docs[0]; if (!d) return { status: 404, body: { ok: false, message: "Perangkat tidak ditemukan." } };
    const wl = await wlanList(cfg, s.dev);
    const last = d._lastInform ? Date.parse(d._lastInform) : 0;
    const rx = String(val(d, "VirtualParameters.RXPower") || "");
    return { status: 200, body: { ok: true, brand: S().brand, cs: S().csNumber,
      model: d._deviceId ? d._deviceId._ProductClass : "", pppoe: val(d, "VirtualParameters.pppoeUsername") || "",
      online: last > 0 && now() - last < 15 * 60000, lastInform: last || null, rx: rx || null,
      ssids: wl.map((w) => ({ idx: w.idx, ssid: w.ssid, enabled: w.enabled, band: w.band || "", canName: w.hasSsid, canPass: !!w.passParam })) } };
  }

  // aksi: ssid | pass | reboot. ONT dan nomor SSID divalidasi dari sesi + daftar ONT itu sendiri.
  async function act(ip, token, kind, idxStr, value) {
    const s = session(token); if (!s) return { status: 401, body: { ok: false, message: "Sesi berakhir. Masuk lagi." } };
    if (!lAct.hit(s.phone, now())) return { status: 429, body: { ok: false, message: "Terlalu cepat. Tunggu sebentar." } };
    const day = new Date(now()).toDateString(); if (s.day !== day) { s.day = day; s.n = 0; }
    if (s.n >= S().maxActionsPerDay) return { status: 429, body: { ok: false, message: "Batas perubahan hari ini sudah tercapai. Hubungi CS bila perlu." } };
    const entry = { deviceId: s.dev, user: "pelanggan", kind };
    if (kind === "reboot") { /* tanpa nilai */ }
    else {
      value = String(value == null ? "" : value);
      if (kind === "ssid" && (value.length < 1 || value.length > 32 || /[\x00-\x1f\x7f"\\]/.test(value))) return { status: 400, body: { ok: false, message: "Nama WiFi 1-32 karakter, tanpa tanda kutip atau garis miring terbalik." } };
      if (kind === "pass" && (value.length < 8 || value.length > 63 || !/^[\x20-\x7e]+$/.test(value))) return { status: 400, body: { ok: false, message: "Sandi WiFi 8-63 karakter (huruf, angka, simbol biasa)." } };
      const w = (await wlanList(cfg, s.dev)).find((x) => x.idx === String(idxStr));
      if (!w) return { status: 400, body: { ok: false, message: "WiFi tidak ditemukan." } };
      const param = kind === "ssid" ? (w.hasSsid ? "SSID" : null) : w.passParam;
      if (!param) return { status: 400, body: { ok: false, message: "Perangkat ini tidak mendukung perubahan tersebut." } };
      Object.assign(entry, { idx: w.idx, oldSsid: w.ssid, value, path: "InternetGatewayDevice.LANDevice.1.WLANConfiguration." + w.idx + "." + param });
    }
    s.n++;
    audit("PORTAL " + kind + " ***" + s.phone.slice(-4) + " " + s.dev + (entry.idx ? " ssid#" + entry.idx : ""));   // nilai (sandi) TIDAK dicatat
    let text;
    try { text = deps.run ? await deps.run(cfg, entry) : await executeChange(cfg, entry); } catch (e) { return { status: 502, body: { ok: false, message: "Gagal menghubungi perangkat." } }; }
    const ok = /^(✅|⏳|🔄)/.test(text);
    return { status: ok ? 200 : 502, body: { ok, message: text.replace(/^[^\w]+\s*/, "").replace(/\(cek: [^)]*\)/, "").slice(0, 200) } };
  }

  function logout(token) { sessions.delete(sha(token || "")); return { status: 200, body: { ok: true } }; }
  function sweep() { const t = now(); otps.forEach((e, k) => { if (t > e.exp) otps.delete(k); }); sessions.forEach((s, k) => { if (t > s.exp) sessions.delete(k); }); [lIp, lPhone, lVerifyIp, lAct].forEach((l) => l.sweep(t)); }
  return { requestOtp, verifyOtp, me, act, logout, sweep, _otps: otps, _sessions: sessions };
}

// ---------- HTTP ----------
function startServer(portal, port, opts) {
  const page = fs.readFileSync(path.join(__dirname, "portal-page.html"), "utf8");
  const trust = !!(opts && opts.trustProxy);
  const SEC = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'" };
  const srv = http.createServer((q, r) => {
    const ip = (trust && String(q.headers["cf-connecting-ip"] || q.headers["x-forwarded-for"] || "").split(",")[0].trim()) || q.socket.remoteAddress || "?";
    const send = (code, body, type) => { r.writeHead(code, Object.assign({ "Content-Type": type || "application/json; charset=utf-8" }, SEC)); r.end(typeof body === "string" ? body : JSON.stringify(body)); };
    const url = (q.url || "/").split("?")[0];
    if (q.method === "GET" && (url === "/" || url === "/mywifi" || url === "/index.html")) return send(200, page, "text/html; charset=utf-8");
    if (q.method === "GET" && url === "/api/me") {
      portal.me(String(q.headers["x-portal-token"] || "")).then((x) => send(x.status, x.body)).catch((e) => { log("portal me:", e.message); send(502, { ok: false, message: "Layanan sedang sibuk." }); });
      return;
    }
    if (q.method !== "POST" || url.indexOf("/api/") !== 0) return send(404, { ok: false, message: "Tidak ditemukan." });
    let b = "", big = false;
    q.on("data", (c) => { b += c; if (b.length > 4096) { big = true; q.destroy(); } });
    q.on("end", () => {
      if (big) return;
      let j = {}; try { j = JSON.parse(b || "{}"); } catch (e) { return send(400, { ok: false, message: "Permintaan tidak valid." }); }
      const tok = String(q.headers["x-portal-token"] || "");
      let p;
      if (url === "/api/otp/request") p = portal.requestOtp(ip, j.phone);
      else if (url === "/api/otp/verify") p = Promise.resolve(portal.verifyOtp(ip, j.phone, j.code));
      else if (url === "/api/wifi/ssid") p = portal.act(ip, tok, "ssid", j.idx, j.value);
      else if (url === "/api/wifi/pass") p = portal.act(ip, tok, "pass", j.idx, j.value);
      else if (url === "/api/reboot") p = portal.act(ip, tok, "reboot");
      else if (url === "/api/logout") p = Promise.resolve(portal.logout(tok));
      else return send(404, { ok: false, message: "Tidak ditemukan." });
      p.then((x) => send(x.status, x.body)).catch((e) => { log("portal:", e.message); send(502, { ok: false, message: "Layanan sedang sibuk." }); });
    });
  });
  srv.listen(port, "0.0.0.0");
  return srv;
}

// ---------- main ----------
async function main() {
  const g = () => readGenieConfig();
  const pick = (k, d) => { const v = g()[k]; return v !== undefined && v !== "" ? v : d; };
  const port = parseInt(pick("portal.port", 3020), 10) || 3020;
  let cache = { at: 0, v: {} };
  const settings = () => {   // dibaca ulang tiap 20 detik; perubahan di Admin -> Config berlaku tanpa restart
    if (Date.now() - cache.at > 20000) {
      const c = g(), p = (k, d) => (c[k] !== undefined && c[k] !== "" ? c[k] : d);
      cache = { at: Date.now(), v: { enabled: String(p("portal.enabled", "false")).toLowerCase() === "true", otpMinutes: Math.min(15, Math.max(1, parseInt(p("portal.otp.minutes", 5), 10) || 5)),
        sessionMinutes: Math.min(120, Math.max(5, parseInt(p("portal.session.minutes", 30), 10) || 30)), maxActionsPerDay: Math.min(50, Math.max(1, parseInt(p("portal.maxActionsPerDay", 10), 10) || 10)),
        brand: p("portal.brand", "WiFi"), csNumber: p("portal.csNumber", "") } };
    }
    return cache.v;
  };
  const portal = createPortal({ nbi: "http://127.0.0.1:7557", settings, send: (phone, text) => core.outboxPush(phone, text) });
  setInterval(() => portal.sweep(), 60000);
  startServer(portal, port, { trustProxy: String(pick("portal.trustProxy", "false")).toLowerCase() === "true" });
  log("Portal WiFi pelanggan di port " + port + (settings().enabled ? "" : " (NONAKTIF: set portal.enabled = 'true' di Admin -> Config)"));
}

module.exports = { createPortal, startServer, normPhone, tagPhone };
if (require.main === module) main().catch((e) => { log("FATAL", e.stack || e.message); process.exit(1); });
