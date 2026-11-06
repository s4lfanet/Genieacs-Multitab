#!/usr/bin/env node
// Gerbang NBI untuk aplikasi Android "Genieacs.apk" (Alijaya): mengecilkan jawaban daftar ONT dan menambah login. Panduan: docs/NBI-SLIM.md
//
// Masalah yang diselesaikan (APK terbaru): daftar ONT meminta SELURUH cabang VirtualParameters/WAN/WLAN semua ONT sekaligus
// (635 ONT = ±41 MB JSON, diminta 2x saat connect, lagi tiap ganti tema/tes koneksi). Parsing 41 MB membuat aplikasi
// kehabisan memori (OutOfMemoryError) lalu keluar sendiri, dan data lambat tampil. Proxy ini TIDAK mengubah APK (tanda tangan
// Alijaya tetap utuh); ia mengubah jawaban server:
//   1. membuang metadata _timestamp/_writable/_object/_type (tidak pernah dibaca aplikasi: string itu tidak ada di kodenya) -> ±68% lebih kecil
//   2. gzip (aplikasi mengirim Accept-Encoding: gzip) -> ±99% lebih kecil di jaringan
//   3. cache 15 detik + permintaan identik yang bersamaan digabung -> muat ulang (ganti tema, tes koneksi) tidak memberatkan server
// Keamanan (tambahan): wajib HTTP Basic = akun UI GenieACS (divalidasi ke UI :3000, hasil benar di-cache 10 menit); /users diblok
// (hash sandi tidak lagi bocor); hanya jalur yang dipakai aplikasi yang diteruskan; gagal login dibatasi per IP.
//
// Konfigurasi (env atau JSON NBI_SLIM_CONF, default /etc/genieacs-multitab/nbi-slim.json):
//   {"port":7560,"listen":"0.0.0.0","upstream":"http://127.0.0.1:7557","ui":"http://127.0.0.1:3000"}
// Node 10+, tanpa dependensi npm.
"use strict";
const http = require("http");
const zlib = require("zlib");
const fs = require("fs");
const crypto = require("crypto");

const CONF_PATH = process.env.NBI_SLIM_CONF || "/etc/genieacs-multitab/nbi-slim.json";
const C = { port: 7560, listen: "0.0.0.0", upstream: "http://127.0.0.1:7557", ui: "http://127.0.0.1:3000", cacheSeconds: 15, authSeconds: 600, maxFails: 10 };
try { Object.assign(C, JSON.parse(fs.readFileSync(CONF_PATH, "utf8"))); } catch (e) { /* tanpa berkas: pakai bawaan */ }
const log = (...a) => console.log(new Date().toISOString(), ...a);

const MAX_BODY = 64 * 1024;
const TASKS = ["reboot", "refreshObject", "getParameterValues", "setParameterValues", "addObject", "deleteObject"];
const OBJ_RE = /^(InternetGatewayDevice|Device|VirtualParameters)(\.[A-Za-z0-9_\-]+)*\.?$/;
const ID_RE = /^[A-Za-z0-9%_.\-]{1,200}$/;
const TAG_RE = /^[A-Za-z0-9%_.\-]{1,200}$/;
const STRIP = { _timestamp: 1, _writable: 1, _object: 1, _type: 1 };

// ---------- keputusan rute (murni; diuji di tools/test-nbi-slim.js) ----------
function judge(method, url, body) {
  const u = String(url || ""), path = u.split("?")[0];
  if (/\.\.|%2e|%2f|%5c|%00|[\x00-\x1f]/i.test(u)) return "path tidak valid";   // traversal, garis miring/NUL terenkode
  if (method === "GET") return /^\/devices\/?$/.test(path) || /^\/faults\/?$/.test(path) ? null : "GET hanya untuk /devices dan /faults";
  const tag = path.match(/^\/devices\/([^\/]+)\/tags\/([^\/]+)\/?$/);
  if (tag) return (method === "POST" || method === "DELETE") && ID_RE.test(tag[1]) && TAG_RE.test(tag[2]) ? null : "tag tidak valid";
  if (method !== "POST") return "metode " + method + " tidak diizinkan";
  const m = path.match(/^\/devices\/([^\/]+)\/tasks\/?$/);
  if (!m || !ID_RE.test(m[1])) return "POST hanya untuk /devices/<id>/tasks";
  let t; try { t = JSON.parse(body || ""); } catch (e) { return "badan bukan JSON"; }
  if (!t || typeof t !== "object" || TASKS.indexOf(t.name) < 0) return "task '" + (t && t.name) + "' tidak diizinkan";
  // Summon aplikasi mengirim refreshObject dengan objectName KOSONG (= segarkan seluruh pohon); addObject/deleteObject wajib berisi jalur
  if (t.name === "refreshObject" && String(t.objectName === undefined ? "" : t.objectName) !== "" && !OBJ_RE.test(String(t.objectName))) return "objectName tidak diizinkan";
  if ((t.name === "addObject" || t.name === "deleteObject") && !OBJ_RE.test(String(t.objectName || ""))) return "objectName tidak diizinkan";
  if (t.name === "getParameterValues" && (!Array.isArray(t.parameterNames) || t.parameterNames.length > 100 || t.parameterNames.some((x) => !OBJ_RE.test(String(x))))) return "parameterNames tidak diizinkan";
  if (t.name === "setParameterValues" && (!Array.isArray(t.parameterValues) || t.parameterValues.length > 100 || t.parameterValues.some((p) => !Array.isArray(p) || !OBJ_RE.test(String(p[0]))))) return "parameterValues tidak diizinkan";
  return null;
}

// buang metadata yang tidak dibaca aplikasi; _value, _instance, _id, _lastInform, _deviceId, _tags, dan semua nama parameter tetap
function strip(o) {
  if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) o[i] = strip(o[i]); return o; }
  if (o && typeof o === "object") { for (const k of Object.keys(o)) { if (STRIP[k] === 1) delete o[k]; else o[k] = strip(o[k]); } return o; }
  return o;
}

// ---------- autentikasi: akun UI GenieACS ----------
const authOk = new Map();        // sha256(user\0pass) -> waktu kedaluwarsa
const fails = new Map();         // ip -> [waktu]
function parseBasic(h) {
  const m = /^Basic\s+([A-Za-z0-9+\/=]+)$/.exec(String(h || ""));
  if (!m) return null;
  const s = Buffer.from(m[1], "base64").toString("utf8"), i = s.indexOf(":");
  return i < 0 ? null : { user: s.slice(0, i), pass: s.slice(i + 1) };
}
function request(url, opts, body, timeout) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: opts.method || "GET", headers: opts.headers || {}, timeout: timeout || 70000 }, (res) => {
      const ch = []; res.on("data", (d) => ch.push(d)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(ch) }));
    });
    r.on("timeout", () => r.destroy(new Error("timeout"))); r.on("error", reject);
    if (body) r.write(body); r.end();
  });
}
async function checkAuth(header, ip, now) {
  const c = parseBasic(header); if (!c || !c.user || c.user.length > 100 || c.pass.length > 200) return { ok: false, code: 401 };
  const key = crypto.createHash("sha256").update(c.user + "\0" + c.pass).digest("hex");
  if ((authOk.get(key) || 0) > now) return { ok: true, user: c.user };
  const f = (fails.get(ip) || []).filter((t) => now - t < 600000);
  if (f.length >= C.maxFails) return { ok: false, code: 429 };
  let r;
  try {
    const body = "username=" + encodeURIComponent(c.user) + "&password=" + encodeURIComponent(c.pass);
    r = await request(C.ui + "/login", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) } }, body, 10000);
  } catch (e) { return { ok: false, code: 503 }; }
  if (r.status === 200) { authOk.set(key, now + C.authSeconds * 1000); if (authOk.size > 200) authOk.forEach((v, k) => { if (v < now) authOk.delete(k); }); return { ok: true, user: c.user }; }
  f.push(now); fails.set(ip, f);
  return { ok: false, code: r.status >= 500 ? 503 : 401 };
}

// ---------- GET /devices: ambil dari NBI, kecilkan, cache ----------
const cache = new Map();         // key -> {at, raw, gz}
const inflight = new Map();      // key -> Promise
async function slimGet(url, key, now) {
  const hit = cache.get(key); if (hit && now - hit.at < C.cacheSeconds * 1000) return hit;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    const r = await request(C.upstream + url, { headers: { Accept: "application/json", "Accept-Encoding": "identity" } });
    let raw = r.body, ct = r.headers["content-type"] || "application/json";
    if (r.status === 200 && /json/.test(ct)) { try { raw = Buffer.from(JSON.stringify(strip(JSON.parse(r.body.toString("utf8"))))); } catch (e) { raw = r.body; } }
    const e = { at: Date.now(), status: r.status, ct: ct, raw: raw, gz: raw.length > 1024 ? await new Promise((res, rej) => zlib.gzip(raw, (er, o) => er ? rej(er) : res(o))) : null, from: r.body.length };
    if (r.status === 200 && raw.length > 65536) { cache.set(key, e); if (cache.size > 8) cache.delete(cache.keys().next().value); }
    return e;
  })();
  inflight.set(key, p);
  try { return await p; } finally { inflight.delete(key); }
}

// ---------- server ----------
function handler(q, r) {
  const ip = q.socket.remoteAddress || "?", t0 = Date.now();
  const send = (code, obj, extra) => { const b = Buffer.from(typeof obj === "string" ? obj : JSON.stringify(obj)); r.writeHead(code, Object.assign({ "Content-Type": "application/json; charset=utf-8", "Content-Length": b.length, "Cache-Control": "no-store" }, extra || {})); r.end(b); };
  let body = "", big = false;
  q.on("data", (c) => { body += c; if (body.length > MAX_BODY) { big = true; q.destroy(); } });
  q.on("end", async () => {
    if (big) return;
    try {
      const a = await checkAuth(q.headers.authorization, ip, Date.now());
      if (!a.ok) return send(a.code, { error: a.code === 429 ? "terlalu banyak percobaan" : a.code === 503 ? "layanan login tidak tersedia" : "login diperlukan" }, a.code === 401 ? { "WWW-Authenticate": 'Basic realm="GenieACS NBI"' } : {});
      const why = judge(q.method, q.url, body);
      if (why) { log("TOLAK", q.method, String(q.url).slice(0, 80), "-", why, "(" + a.user + ")"); return send(403, { error: why }); }
      if (q.method === "GET") {
        const e = await slimGet(q.url, a.user + "|" + q.url, Date.now()), gz = e.gz && /\bgzip\b/.test(q.headers["accept-encoding"] || "");
        const out = gz ? e.gz : e.raw, h = { "Content-Type": e.ct, "Content-Length": out.length, "Cache-Control": "no-store" }; if (gz) h["Content-Encoding"] = "gzip";
        r.writeHead(e.status, h); r.end(out);
        if (e.from > 100000) log("GET", q.url.split("?")[0], "(" + a.user + ")", Math.round(e.from / 1024) + " KB -> " + Math.round(out.length / 1024) + " KB" + (gz ? " gzip" : ""), (Date.now() - t0) + " ms");
        return;
      }
      const hd = { "Content-Type": "application/json" }; if (body) hd["Content-Length"] = Buffer.byteLength(body);
      const u = await request(C.upstream + q.url, { method: q.method, headers: hd }, body || null);
      log(q.method, q.url.split("?")[0].replace(/(devices\/)[^\/]+/, "$1<id>"), "(" + a.user + ")", u.status);
      r.writeHead(u.status, { "Content-Type": u.headers["content-type"] || "application/json", "Content-Length": u.body.length, "Cache-Control": "no-store" }); r.end(u.body);
    } catch (e) { log("galat:", e.message); if (!r.headersSent) send(502, { error: "NBI tidak menjawab" }); else r.end(); }
  });
}
function start(port, listen) { const s = http.createServer(handler); s.listen(port === undefined ? C.port : port, listen || C.listen); return s; }
module.exports = { judge, strip, start, C, parseBasic };
if (require.main === module) { const s = start(); s.on("listening", () => log("nbi-slim di " + C.listen + ":" + s.address().port + " -> NBI " + C.upstream + " (login = akun UI " + C.ui + ")")); }
