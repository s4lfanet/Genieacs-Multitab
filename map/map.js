#!/usr/bin/env node
// Peta pelanggan & ODP untuk GenieACS (opsional, berdiri sendiri).
// - Tanpa dependensi npm, kompatibel Node 12. Tidak mengubah kode atau database GenieACS.
// - Data ONT dibaca dari NBI (hanya GET). Lokasi/ODP disimpan di map/data/locations.json.
// - SEMUA route (halaman dan API) wajib login (HTTP Basic). Default hanya listen di 127.0.0.1.
// - Tidak ada route yang menulis ke ONT.
//
// Pemakaian:
//   node map.js --init     # buat config.json + password acak (ditampilkan sekali)
//   node map.js            # jalankan server
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");

const DIR = __dirname;
const CONFIG_FILE = path.join(DIR, "config.json");
const DATA_DIR = path.join(DIR, "data");
const DATA_FILE = path.join(DATA_DIR, "locations.json");
const HTML_FILE = path.join(DIR, "peta.html");
const MAX_BODY = 64 * 1024;

function log(...a) { console.log(new Date().toISOString(), ...a); }

// ---------- config & auth ----------
function hashPass(pass, saltHex) {
  return crypto.scryptSync(String(pass), Buffer.from(saltHex, "hex"), 64).toString("hex");
}

function init() {
  if (fs.existsSync(CONFIG_FILE)) { console.error("config.json sudah ada; hapus dulu kalau mau membuat ulang."); process.exit(1); }
  const pass = crypto.randomBytes(12).toString("base64").replace(/[+/=]/g, "x");
  const salt = crypto.randomBytes(16).toString("hex");
  const cfg = { host: "127.0.0.1", port: 7570, nbi: "http://127.0.0.1:7557", user: "admin", salt, passHash: hashPass(pass, salt) };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  console.log("config.json dibuat.\nUser    : " + cfg.user + "\nPassword: " + pass + "\n(catat sekarang, tidak ditampilkan lagi)");
}

function loadConfig() {
  let c;
  try { c = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch (e) { return null; }
  if (!c.user || !c.salt || !c.passHash) return null;
  return Object.assign({ host: "127.0.0.1", port: 7570, nbi: "http://127.0.0.1:7557" }, c);
}

const FAILS = new Map(); // ip -> {n, until}
function authOk(cfg, req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Basic ")) return false;
  const raw = Buffer.from(h.slice(6), "base64").toString("utf8");
  const i = raw.indexOf(":");
  if (i < 0) return false;
  const user = raw.slice(0, i), pass = raw.slice(i + 1);
  const a = Buffer.from(hashPass(pass, cfg.salt), "hex");
  const b = Buffer.from(cfg.passHash, "hex");
  const userOk = user.length === cfg.user.length && crypto.timingSafeEqual(Buffer.from(user), Buffer.from(cfg.user));
  return a.length === b.length && crypto.timingSafeEqual(a, b) && userOk;
}

// ---------- data lokal ----------
function readData() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return { devices: d.devices || {}, odps: d.odps || {} };
  } catch (e) { return { devices: {}, odps: {} }; }
}
function writeData(d) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(d, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, DATA_FILE);
}

function num(v, lo, hi) {
  const n = Number(v);
  return isFinite(n) && n >= lo && n <= hi ? n : null;
}
function str(v, max) { return String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max); }

// ---------- NBI (hanya GET) ----------
function nbiDevices(cfg) {
  const proj = ["_id", "_lastInform", "_deviceId._SerialNumber", "_deviceId._ProductClass", "_deviceId._Manufacturer",
    "VirtualParameters.pppoeUsername", "VirtualParameters.redaman", "VirtualParameters.RXPower", "VirtualParameters.pppoeIP"].join(",");
  const url = cfg.nbi + "/devices/?projection=" + encodeURIComponent(proj);
  return new Promise((resolve, reject) => {
    const r = http.get(url, { timeout: 20000 }, res => {
      let b = ""; res.setEncoding("utf8");
      res.on("data", c => { b += c; if (b.length > 50e6) r.destroy(new Error("respons NBI terlalu besar")); });
      res.on("end", () => { try { resolve(JSON.parse(b)); } catch (e) { reject(new Error("NBI bukan JSON (HTTP " + res.statusCode + ")")); } });
    });
    r.on("timeout", () => r.destroy(new Error("NBI timeout")));
    r.on("error", reject);
  });
}
const vp = (d, k) => { const x = d.VirtualParameters && d.VirtualParameters[k]; return x && x._value != null ? x._value : null; };

async function devicesView(cfg) {
  const loc = readData();
  const now = Date.now();
  const list = (await nbiDevices(cfg)).map(d => {
    const rx = vp(d, "redaman") != null ? vp(d, "redaman") : vp(d, "RXPower");
    const li = d._lastInform ? Date.parse(d._lastInform) : 0;
    const l = loc.devices[d._id] || null;
    return {
      id: d._id,
      sn: d._deviceId && d._deviceId._SerialNumber || "",
      model: d._deviceId && d._deviceId._ProductClass || "",
      pppoe: vp(d, "pppoeUsername") || "",
      ip: vp(d, "pppoeIP") || "",
      rx: rx == null || rx === "" ? null : Number(rx),
      online: li > 0 && now - li < 10 * 60 * 1000,
      loc: l
    };
  });
  return { devices: list, odps: odpView(loc) };
}
function odpView(loc) {
  const used = {};
  Object.keys(loc.devices).forEach(k => { const o = loc.devices[k].odp; if (o) used[o] = (used[o] || 0) + 1; });
  return Object.keys(loc.odps).map(id => Object.assign({ id, used: used[id] || 0 }, loc.odps[id]));
}

// ---------- HTTP ----------
function send(res, code, body, type) {
  const buf = Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  res.writeHead(code, {
    "Content-Type": type || "application/json; charset=utf-8",
    "Content-Length": buf.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: https://tile.openstreetmap.org https://server.arcgisonline.com https://unpkg.com; connect-src 'self'"
  });
  res.end(buf);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = "", n = 0;
    req.on("data", c => { n += c.length; if (n > MAX_BODY) { reject(new Error("body terlalu besar")); req.destroy(); } else b += c; });
    req.on("end", () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(new Error("JSON tidak valid")); } });
    req.on("error", reject);
  });
}

function sameOrigin(req) {
  const o = req.headers.origin;
  return !o || o === "http://" + req.headers.host || o === "https://" + req.headers.host;
}

async function handle(cfg, req, res) {
  const ip = req.socket.remoteAddress;
  const f = FAILS.get(ip);
  if (f && f.until > Date.now()) return send(res, 429, { error: "terlalu banyak percobaan, coba lagi nanti" });
  if (!authOk(cfg, req)) {
    const n = (f ? f.n : 0) + 1;
    FAILS.set(ip, { n, until: n >= 5 ? Date.now() + 60000 : 0 });
    res.setHeader("WWW-Authenticate", 'Basic realm="Peta GenieACS", charset="UTF-8"');
    return send(res, 401, { error: "login diperlukan" });
  }
  FAILS.delete(ip);

  const url = new URL(req.url, "http://x");
  const p = url.pathname;

  if (req.method === "GET" && (p === "/" || p === "/peta.html")) return send(res, 200, fs.readFileSync(HTML_FILE), "text/html; charset=utf-8");
  if (req.method === "GET" && p === "/api/devices") return send(res, 200, await devicesView(cfg));

  if (req.method !== "GET" && (!sameOrigin(req) || !/^application\/json/.test(req.headers["content-type"] || ""))) {
    return send(res, 403, { error: "ditolak (origin/content-type)" });
  }

  let m = p.match(/^\/api\/loc\/(.+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const d = readData();
    if (req.method === "DELETE") { delete d.devices[id]; writeData(d); return send(res, 200, { ok: true }); }
    if (req.method === "PUT") {
      const b = await readBody(req);
      const lat = num(b.lat, -90, 90), lng = num(b.lng, -180, 180);
      if (lat === null || lng === null) return send(res, 400, { error: "lat/lng tidak valid" });
      const odp = str(b.odp, 60);
      if (odp && !d.odps[odp]) return send(res, 400, { error: "ODP tidak ada" });
      d.devices[id] = { name: str(b.name, 120), lat, lng, odp, notes: str(b.notes, 500), updated: new Date().toISOString() };
      writeData(d);
      return send(res, 200, { ok: true });
    }
  }

  m = p.match(/^\/api\/odp(?:\/(.+))?$/);
  if (m) {
    const d = readData();
    if (req.method === "GET" && !m[1]) return send(res, 200, odpView(d));
    if (req.method === "DELETE" && m[1]) {
      const id = decodeURIComponent(m[1]);
      delete d.odps[id];
      Object.keys(d.devices).forEach(k => { if (d.devices[k].odp === id) d.devices[k].odp = ""; });
      writeData(d);
      return send(res, 200, { ok: true });
    }
    if (req.method === "PUT") {
      const b = await readBody(req);
      const id = str(m[1] ? decodeURIComponent(m[1]) : b.id, 60);
      const lat = num(b.lat, -90, 90), lng = num(b.lng, -180, 180), cap = num(b.capacity, 1, 1024);
      if (!id || lat === null || lng === null) return send(res, 400, { error: "id/lat/lng tidak valid" });
      d.odps[id] = { name: str(b.name, 120) || id, lat, lng, capacity: cap === null ? 8 : Math.floor(cap), notes: str(b.notes, 500) };
      writeData(d);
      return send(res, 200, { ok: true });
    }
  }
  return send(res, 404, { error: "tidak ditemukan" });
}

function main() {
  if (process.argv.includes("--init")) return init();
  const cfg = loadConfig();
  if (!cfg) { console.error("config.json belum ada/tidak lengkap. Jalankan: node map.js --init"); process.exit(1); }
  http.createServer((req, res) => {
    handle(cfg, req, res).catch(e => { log("error", req.method, req.url, e.message); try { send(res, 500, { error: "kesalahan server: " + e.message }); } catch (x) { /* sudah terkirim */ } });
  }).listen(cfg.port, cfg.host, () => log("Peta GenieACS di http://" + cfg.host + ":" + cfg.port + "/ (NBI " + cfg.nbi + ")"));
}
main();
