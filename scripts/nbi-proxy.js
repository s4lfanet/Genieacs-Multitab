#!/usr/bin/env node
// Proxy berpassword di depan NBI GenieACS (port 7557) untuk akses dari luar (mis. lewat Cloudflare Tunnel).
// Node 12+, tanpa npm. NBI sendiri TIDAK punya autentikasi, jadi port 7557 tidak boleh dibuka langsung ke internet.
//
//   - Mendengarkan di 127.0.0.1:7558 (hanya proses di server ini, mis. cloudflared, yang bisa menjangkau).
//   - Wajib HTTP Basic; sandi disimpan sebagai hash scrypt (bukan teks).
//   - Hanya meneruskan yang dipakai aplikasi Android (daftar putih), sisanya 403:
//       GET  /devices...                                  baca device
//       POST /devices/<id>/tasks   dengan task reboot | refreshObject | getParameterValues | setParameterValues
//            setParameterValues hanya untuk SSID / sandi WiFi (WLANConfiguration.*, VirtualParameters.WlanSSID/WlanPassword)
//     Tidak diteruskan: hapus device, preset/provision/VP, file, factoryReset, download, addObject/deleteObject, dst.
//   - Gagal login berulang dari satu IP dibatasi (429).
//
// Konfigurasi (env atau berkas JSON NBI_PROXY_CONF, default /etc/genieacs-multitab/nbi-proxy.json):
//   {"user":"nama","hash":"scrypt$...","port":7558,"listen":"127.0.0.1","upstream":"http://127.0.0.1:7557"}
// Membuat berkas (sandi dibaca dari stdin, tidak lewat argumen):
//   printf '%s' "sandi" | node nbi-proxy.js --make-conf nama > /etc/genieacs-multitab/nbi-proxy.json
"use strict";
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");

const CONF_PATH = process.env.NBI_PROXY_CONF || "/etc/genieacs-multitab/nbi-proxy.json";
const MAX_BODY = 64 * 1024;
const TASKS = ["reboot", "refreshObject", "getParameterValues", "setParameterValues"];
const OBJ_RE = /^(InternetGatewayDevice|Device|VirtualParameters)(\.[A-Za-z0-9_\-]+)*\.?$/;
const SET_RE = /^(InternetGatewayDevice\.LANDevice\.\d+\.WLANConfiguration\.\d+\.(SSID|KeyPassphrase|PreSharedKey\.\d+\.KeyPassphrase)|VirtualParameters\.(WlanSSID|WlanPassword))$/;
const ID_RE = /^[A-Za-z0-9%_.\-]{1,200}$/;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const N = 16384, h = crypto.scryptSync(pw, salt, 32, { N: N });
  return "scrypt$" + N + "$" + salt.toString("base64") + "$" + h.toString("base64");
}
function verifyPassword(pw, stored) {
  const p = String(stored || "").split("$");
  if (p.length !== 4 || p[0] !== "scrypt") return false;
  try {
    const want = Buffer.from(p[3], "base64");
    const got = crypto.scryptSync(pw, Buffer.from(p[2], "base64"), want.length, { N: parseInt(p[1], 10) });
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  } catch (e) { return false; }
}

// ---- keputusan: apakah permintaan ini boleh diteruskan? (murni, mudah diuji) ----
function judge(method, url, body) {
  const u = String(url || "");
  const path = u.split("?")[0];
  if (method === "GET") return /^\/devices(\/|$)/.test(path) && !/\.\./.test(u) ? null : "GET hanya untuk /devices";
  if (method !== "POST") return "metode " + method + " tidak diizinkan";
  const m = path.match(/^\/devices\/([^\/]+)\/tasks\/?$/);
  if (!m || !ID_RE.test(m[1])) return "POST hanya untuk /devices/<id>/tasks";
  let t; try { t = JSON.parse(body || ""); } catch (e) { return "badan bukan JSON"; }
  if (!t || typeof t !== "object" || TASKS.indexOf(t.name) < 0) return "task '" + (t && t.name) + "' tidak diizinkan";
  if (t.name === "refreshObject" && !OBJ_RE.test(String(t.objectName || ""))) return "objectName tidak diizinkan";
  if (t.name === "getParameterValues") {
    const l = t.parameterNames;
    if (!Array.isArray(l) || !l.length || l.length > 50 || l.some((x) => !OBJ_RE.test(String(x)))) return "parameterNames tidak diizinkan";
  }
  if (t.name === "setParameterValues") {
    const l = t.parameterValues;
    if (!Array.isArray(l) || !l.length || l.length > 20 || l.some((x) => !Array.isArray(x) || !SET_RE.test(String(x[0])))) return "hanya SSID / sandi WiFi yang boleh diubah";
  }
  return null;
}

function loadConf() {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(CONF_PATH, "utf8")); } catch (e) { /* pakai env */ }
  return {
    user: process.env.NBI_PROXY_USER || c.user, hash: process.env.NBI_PROXY_HASH || c.hash,
    port: parseInt(process.env.NBI_PROXY_PORT || c.port || 7558, 10), listen: process.env.NBI_PROXY_LISTEN || c.listen || "127.0.0.1",
    upstream: process.env.NBI_UPSTREAM || c.upstream || "http://127.0.0.1:7557"
  };
}

function start(conf) {
  if (!conf.user || !conf.hash) { console.error("nbi-proxy: user/hash belum diatur (lihat komentar di atas berkas)"); process.exit(1); }
  const up = new URL(conf.upstream);
  const fails = new Map(); // ip -> {n, until}
  const log = (s) => console.log(new Date().toISOString() + " " + s);
  const deny = (res, code, msg) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: msg })); };
  function clientIp(req) { return String(req.headers["cf-connecting-ip"] || req.socket.remoteAddress || "?").split(",")[0].trim(); }
  function authOk(req) {
    const h = String(req.headers.authorization || "");
    if (h.slice(0, 6).toLowerCase() !== "basic ") return false;
    const s = Buffer.from(h.slice(6), "base64").toString("utf8"), i = s.indexOf(":");
    if (i < 0) return false;
    const userOk = crypto.timingSafeEqual(crypto.createHash("sha256").update(s.slice(0, i)).digest(), crypto.createHash("sha256").update(conf.user).digest());
    return verifyPassword(s.slice(i + 1), conf.hash) && userOk;
  }
  const srv = http.createServer((req, res) => {
    const ip = clientIp(req), f = fails.get(ip);
    if (f && f.until > Date.now()) return deny(res, 429, "terlalu banyak percobaan gagal, coba lagi nanti");
    if (!authOk(req)) {
      const n = (f ? (f.until && f.until <= Date.now() ? 0 : f.n) : 0) + 1;
      fails.set(ip, { n: n, until: n >= 10 ? Date.now() + 10 * 60 * 1000 : 0 });
      if (fails.size > 5000) fails.clear();
      log("tolak " + ip + " login salah (" + n + ")");
      setTimeout(() => { res.writeHead(401, { "WWW-Authenticate": 'Basic realm="GenieACS NBI"', "Content-Type": "application/json" }); res.end('{"error":"autentikasi diperlukan"}'); }, 300);
      return;
    }
    fails.delete(ip);
    const chunks = []; let size = 0, dead = false;
    req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { dead = true; deny(res, 413, "badan terlalu besar"); req.destroy(); } else chunks.push(c); });
    req.on("end", () => {
      if (dead) return;
      const body = Buffer.concat(chunks).toString("utf8");
      const why = judge(req.method, req.url, body);
      if (why) { log("larang " + ip + " " + req.method + " " + req.url.split("?")[0] + ": " + why); return deny(res, 403, why); }
      const headers = {}; ["content-type", "accept"].forEach((k) => { if (req.headers[k]) headers[k] = req.headers[k]; });
      headers["content-length"] = Buffer.byteLength(body);
      const pr = http.request({ host: up.hostname, port: up.port || 80, method: req.method, path: req.url, headers: headers, timeout: 60000 }, (r) => {
        const h = Object.assign({}, r.headers); delete h["transfer-encoding"]; delete h.connection;
        res.writeHead(r.statusCode, h); r.pipe(res);
      });
      pr.on("timeout", () => pr.destroy(new Error("timeout")));
      pr.on("error", (e) => { log("upstream gagal: " + e.message); if (!res.headersSent) deny(res, 502, "NBI tidak menjawab"); else res.destroy(); });
      log("ok " + ip + " " + req.method + " " + req.url.split("?")[0]);
      pr.end(body);
    });
  });
  srv.listen(conf.port, conf.listen, () => log("nbi-proxy " + conf.listen + ":" + conf.port + " -> " + conf.upstream));
  return srv;
}

if (require.main === module) {
  if (process.argv[2] === "--make-conf") {
    const user = process.argv[3]; if (!user || /[^A-Za-z0-9_.\-]/.test(user)) { console.error("nama pengguna: huruf/angka/_ . - saja"); process.exit(2); }
    const pw = fs.readFileSync(0, "utf8").replace(/\r?\n$/, "");
    if (pw.length < 12) { console.error("sandi minimal 12 karakter"); process.exit(2); }
    console.log(JSON.stringify({ user: user, hash: hashPassword(pw), port: 7558, listen: "127.0.0.1", upstream: "http://127.0.0.1:7557" }, null, 1));
  } else start(loadConf());
}
module.exports = { judge, hashPassword, verifyPassword, start };
