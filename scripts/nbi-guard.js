#!/usr/bin/env node
// Penjaga akses NBI GenieACS (service root kecil): menerapkan pengaturan dari halaman Admin -> "Akses NBI" ke firewall
// (scripts/nbi-firewall.sh) dan melaporkan status + daftar sumber yang sedang diblokir. Panduan: docs/NBI-GUARD.md
//
// Alur: halaman menulis Config "nbi.fw.cfg" ('base64 JSON {enabled,port,allow:[{c,n}],rev}'); layanan ini membaca tiap 5 detik,
// MEMVALIDASI KETAT, lalu memanggil nbi-firewall.sh dengan argumen (tanpa shell). Status ditulis ke Config "nbi.fw.status".
// Tanpa dependensi npm; kompatibel Node 10+ (tanpa ?. / ??). Harus jalan sebagai root (iptables, journalctl -k).
"use strict";
const fs = require("fs");
const cp = require("child_process");
const crypto = require("crypto");

const DB = process.env.GENIEACS_DB || "genieacs";
const FW = process.env.NBI_FW_SCRIPT || "/usr/local/lib/genieacs-multitab/nbi-firewall.sh";
const CONF_DIR = process.env.NBI_CONF_DIR || "/etc/genieacs-multitab";
const DEFAULT_PORT = 7557;
// Port layanan lain yang TIDAK boleh dibatasi lewat halaman ini (membatasinya bisa memutus ONT, UI, atau SSH)
const RESERVED = { 22: "SSH", 80: "web", 443: "web", 3000: "UI GenieACS", 3010: "bot WhatsApp", 3020: "portal pelanggan", 7547: "CWMP (ONT terhubung ke sini)", 7567: "FS GenieACS", 27017: "MongoDB" };
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------- validasi (murni; diuji di tools/test-nbi-guard.js) ----------
function ip4(s) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/.exec(String(s).trim());
  if (!m) return null;
  const o = [m[1], m[2], m[3], m[4]].map(Number);
  if (o.some((x) => x > 255)) return null;
  if ([m[1], m[2], m[3], m[4]].some((x) => x.length > 1 && x[0] === "0")) return null;   // tanpa nol di depan (ambigu/oktal)
  const n = m[5] === undefined ? 32 : Number(m[5]);
  if (n < 16 || n > 32) return null;   // terlalu lebar (/0../15) ditolak: itu sama saja dengan membuka NBI untuk sebagian besar internet
  if (o[0] === 0) return null;
  return o.join(".") + "/" + n;
}
// cfg mentah -> {ok, errors[], clean:{enabled,port,allow:[{c,n}],rev}}
function validate(cfg) {
  const errors = [];
  if (!cfg || typeof cfg !== "object") return { ok: false, errors: ["pengaturan tidak valid"], clean: null };
  const enabled = cfg.enabled === true || cfg.enabled === "true";
  const port = Number(cfg.port === undefined || cfg.port === "" ? DEFAULT_PORT : cfg.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push("port harus angka 1-65535");
  else if (RESERVED[port]) errors.push("port " + port + " dipakai " + RESERVED[port] + "; tidak boleh dibatasi dari halaman ini");
  const allow = [], seen = {};
  const arr = Array.isArray(cfg.allow) ? cfg.allow : [];
  if (arr.length > 50) errors.push("maksimal 50 entri");
  arr.slice(0, 50).forEach((e, i) => {
    const raw = e && typeof e === "object" ? e.c : e;
    const c = ip4(raw);
    if (!c) { errors.push("entri " + (i + 1) + " tidak valid: '" + String(raw).slice(0, 40) + "' (pakai IPv4 seperti 114.122.75.181 atau 10.8.0.0/24; blok lebih lebar dari /16 ditolak)"); return; }
    if (seen[c]) return; seen[c] = 1;
    allow.push({ c: c, n: String((e && e.n) || "").replace(/[^\w .,@()\/-]/g, "").slice(0, 60) });
  });
  const rev = Number(cfg.rev) || 0;
  return { ok: errors.length === 0, errors: errors, clean: { enabled: enabled, port: port, allow: allow, rev: rev } };
}
const sig = (c) => crypto.createHash("sha256").update(JSON.stringify([c.enabled, c.port, c.allow.map((x) => x.c).sort()])).digest("hex");

// SRC= dari baris log kernel gm-nbi-blok-<port> -> [{ip,count,last}] (terbanyak dulu)
function parseBlocked(text, port) {
  const by = {};
  String(text).split("\n").forEach((l) => {
    if (l.indexOf("gm-nbi-blok-" + port + ":") < 0) return;
    const m = /^(\d+)(?:\.\d+)?\s.*?SRC=(\d{1,3}(?:\.\d{1,3}){3})/.exec(l);
    if (!m) return;
    const t = Number(m[1]) * 1000, e = by[m[2]] || (by[m[2]] = { ip: m[2], count: 0, last: 0 });
    e.count++; if (t > e.last) e.last = t;
  });
  return Object.keys(by).map((k) => by[k]).sort((a, b) => b.count - a.count || b.last - a.last).slice(0, 20);
}

// ---------- MongoDB (shell mongo/mongosh) ----------
let MBIN = null;
function mongoBin() {
  if (MBIN) return MBIN;
  for (const b of ["mongosh", "mongo"]) { try { cp.execFileSync(b, ["--version"], { stdio: "ignore" }); MBIN = b; return b; } catch (e) { /* coba berikutnya */ } }
  throw new Error("shell mongo tidak ditemukan");
}
function mongo(js) {
  return new Promise((resolve, reject) => {
    let b; try { b = mongoBin(); } catch (e) { return reject(e); }
    cp.execFile(b, [DB, "--quiet", "--eval", js], { encoding: "utf8", timeout: 15000 }, (err, out) => err ? reject(err) : resolve(String(out).trim().split("\n").pop()));
  });
}
const unq = (v) => { v = String(v || "").trim(); return v.length >= 2 && v[0] === "'" && v[v.length - 1] === "'" ? v.slice(1, -1) : v; };
const dec = (v) => { try { return JSON.parse(Buffer.from(unq(v), "base64").toString("utf8")); } catch (e) { return null; } };
const enc = (o) => "'" + Buffer.from(JSON.stringify(o)).toString("base64") + "'";
async function getKey(id) { return mongo('var c=db.config.findOne({_id:' + JSON.stringify(id) + '});print(c?String(c.value):"")'); }
async function setKey(id, value) { await mongo('db.config.updateOne({_id:' + JSON.stringify(id) + '},{$set:{value:' + JSON.stringify(value) + '}},{upsert:true});print("ok")'); }

// ---------- sistem ----------
function run(cmd, args, env, timeout) {
  return new Promise((resolve) => {
    cp.execFile(cmd, args, { encoding: "utf8", timeout: timeout || 60000, env: Object.assign({}, process.env, env || {}) }, (err, so, se) =>
      resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, out: String(so || ""), err: String(se || "") }));
  });
}
async function chainActive(port) {
  return (await run("iptables", ["-C", "INPUT", "-p", "tcp", "--dport", String(port), "-j", "GM_NBI_" + port])).code === 0;
}
async function ownSubnets() {
  const r = await run("ip", ["-4", "-o", "addr", "show", "scope", "global"]);
  return r.out.split("\n").map((l) => (l.trim().split(/\s+/)[3] || "")).filter(Boolean);
}
const netOf = (cidr) => {   // 192.168.54.254/24 -> 192.168.54.0/24 (untuk membandingkan dengan entri tersimpan)
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/.exec(cidr); if (!m) return cidr;
  const n = Number(m[5]), ip = ((+m[1] << 24) | (+m[2] << 16) | (+m[3] << 8) | +m[4]) >>> 0, mask = n === 0 ? 0 : (0xffffffff << (32 - n)) >>> 0, a = (ip & mask) >>> 0;
  return [a >>> 24, (a >>> 16) & 255, (a >>> 8) & 255, a & 255].join(".") + "/" + n;
};
async function savedAllow(port) {
  let t = ""; try { t = fs.readFileSync(CONF_DIR + "/nbi-allow-" + port + ".conf", "utf8"); } catch (e) { return []; }
  const own = (await ownSubnets()).map(netOf);
  return t.split("\n").map((s) => s.trim()).filter((s) => s && s[0] !== "#").map((s) => ip4(s) || "").filter(Boolean).filter((c) => own.indexOf(netOf(c)) < 0);
}

// ---------- penerapan ----------
let applied = null;       // {sig, port, enabled}
let lastResult = { ok: true, msg: "belum ada perubahan", rev: 0 };
async function applyCfg(c) {
  const env = { NBI_PORT: String(c.port) };
  if (applied && applied.port !== c.port) {
    // port pelindung berpindah: cabut chain lama; unit boot milik 7557 dimatikan supaya tidak memasang ulang pembatasan di port lama
    await run("bash", [FW, "--boot-stop"], { NBI_PORT: String(applied.port) });
    if (applied.port === DEFAULT_PORT) await run("systemctl", ["disable", "--now", "genieacs-nbi-firewall.service"]);
  }
  if (!c.enabled) {
    const r = await run("bash", [FW, "--boot-stop"], env);
    if (c.port === DEFAULT_PORT) await run("systemctl", ["disable", "genieacs-nbi-firewall.service"]);
    return r.code === 0 ? { ok: true, msg: "pembatasan dimatikan (port " + c.port + " terbuka untuk semua yang bisa menjangkau server)" } : { ok: false, msg: "gagal mematikan: " + (r.err || r.out).slice(-200) };
  }
  const args = [FW, "--set"];
  c.allow.forEach((x) => { args.push("--allow", x.c); });
  const r = await run("bash", args, env, 90000);
  if (r.code !== 0) return { ok: false, msg: "firewall menolak/gagal (aturan lama dikembalikan bila perlu): " + (r.err || r.out).split("\n").filter(Boolean).slice(-2).join(" | ").slice(0, 250) };
  return { ok: true, msg: "diterapkan: " + c.allow.length + " sumber diizinkan + jaringan server sendiri + localhost" };
}

async function publish(c, extra) {
  const blockedTxt = (await run("journalctl", ["-k", "--since", "-24h", "--no-pager", "-o", "short-unix"], null, 30000)).out;
  const st = {
    at: Date.now(), enabled: c.enabled, port: c.port, active: await chainActive(c.port),
    allow: c.allow, own: (await ownSubnets()), blocked: parseBlocked(blockedTxt, c.port), result: lastResult, rev: c.rev,
    listen: (await run("ss", ["-Htln", "( sport = :" + c.port + " )"])).out.trim() !== ""
  };
  if (extra) Object.assign(st, extra);
  await setKey("nbi.fw.status", enc(st));
}

async function tick(state) {
  let raw = unq(await getKey("nbi.fw.cfg"));
  if (!raw) {   // pertama kali: ambil keadaan firewall yang SUDAH ada, jangan mengubah apa pun
    const port = DEFAULT_PORT, c = { enabled: await chainActive(port), port: port, allow: (await savedAllow(port)).map((x) => ({ c: x, n: "diimpor dari firewall yang sudah terpasang" })), rev: 0 };
    await setKey("nbi.fw.cfg", enc(c)); raw = unq(await getKey("nbi.fw.cfg"));
    log("pengaturan awal diimpor dari firewall yang ada:", JSON.stringify(c));
  }
  const v = validate(dec(raw));
  if (!v.ok) {
    if (state.badRaw !== raw) { state.badRaw = raw; lastResult = { ok: false, msg: v.errors.join("; "), rev: (v.clean && v.clean.rev) || 0 }; log("pengaturan ditolak:", lastResult.msg); await publish(state.last || validate({ port: DEFAULT_PORT }).clean); }
    return;
  }
  state.badRaw = "";
  const c = v.clean, s = sig(c);
  const changed = !applied || applied.sig !== s;
  if (changed) {
    if (!applied) {
      // start layanan: terapkan hanya bila keadaan nyata berbeda dari yang diminta (hindari menyentuh aturan yang sudah benar)
      const have = await chainActive(c.port), same = have === c.enabled;
      if (same && have) {
        const sv = (await savedAllow(c.port)).sort().join(","), want = c.allow.map((x) => x.c).sort().join(",");
        if (sv === want) { applied = { sig: s, port: c.port, enabled: c.enabled }; state.last = c; lastResult = { ok: true, msg: "keadaan firewall sudah sesuai", rev: c.rev }; await publish(c); return; }
      } else if (same && !have) { applied = { sig: s, port: c.port, enabled: c.enabled }; state.last = c; lastResult = { ok: true, msg: "pembatasan nonaktif (sesuai pengaturan)", rev: c.rev }; await publish(c); return; }
    }
    const r = await applyCfg(c);
    lastResult = { ok: r.ok, msg: r.msg, rev: c.rev }; log("terapkan rev", c.rev, "->", r.ok ? "OK" : "GAGAL", r.msg);
    if (r.ok) applied = { sig: s, port: c.port, enabled: c.enabled };
    state.last = c; state.pub = 0;
  } else if (c.enabled && Date.now() - (state.heal || 0) > 30000) {   // penyembuhan: aturan hilang (flush manual) -> pasang lagi
    state.heal = Date.now();
    if (!(await chainActive(c.port))) { log("chain hilang, memasang ulang"); const r = await applyCfg(c); lastResult = { ok: r.ok, msg: "dipasang ulang otomatis: " + r.msg, rev: c.rev }; state.pub = 0; }
  }
  state.last = c;
  if (Date.now() - (state.pub || 0) > 20000) { state.pub = Date.now(); await publish(c); }
}

async function main() {
  if (process.getuid && process.getuid() !== 0) { console.error("nbi-guard harus dijalankan sebagai root"); process.exit(1); }
  if (!fs.existsSync(FW)) { console.error("tidak ada " + FW + " (jalankan scripts/setup-nbi-guard.sh)"); process.exit(1); }
  log("nbi-guard mulai (db " + DB + ")");
  const state = {};
  for (;;) {
    try { await tick(state); } catch (e) { log("tick gagal:", e.message); }
    await new Promise((r) => setTimeout(r, 5000));
  }
}
module.exports = { ip4, validate, sig, parseBlocked, netOf, RESERVED };
if (require.main === module) main();
