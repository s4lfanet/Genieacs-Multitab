#!/usr/bin/env node
// Layanan updater GenieACS-Multitab (jalan sebagai root lewat systemd; Node 12+, tanpa npm).
//
// Halaman "Update" di sidebar Admin (map/update.html) berbicara dengan layanan ini lewat dua key Config:
//   update.request  <- ditulis halaman: {"id","a":"check"|"apply"|"rollback","c":["ui","wa"]}
//   update.status   -> ditulis layanan: versi terpasang, versi terbaru, daftar perubahan, log, hasil terakhir
//   update.hb       -> detak jantung (halaman tahu layanan hidup)
//   sys.watch       <- ditulis halaman Status tiap ±20 dtk selama dibuka (nilai berubah = ada yang melihat)
//   sys.status      -> status layanan GenieACS (ui/cwmp/nbi/fs + pendukung) & sistem; hanya dibaca halaman Status.
//                      Diperbarui tiap ±10 dtk selama ada yang melihat, selain itu tiap 5 menit.
//
// Batasan keamanan (sengaja):
// - Halaman TIDAK bisa mengirim perintah. Permintaan divalidasi ketat (aksi dan komponen dari daftar tetap);
//   tidak ada nilai dari Config yang masuk ke shell.
// - Alamat repo, branch, dan semua path ada di /etc/genieacs-multitab/updater.conf (milik root), bukan dari browser.
// - Checkout repo milik root (/opt/genieacs-multitab) dan hanya di-fast-forward dari origin/<branch>.
// - Yang disentuh hanya tampilan (public/app-*.js + halaman html) dan, bila dipilih, file bot WA. Provision, preset,
//   Config ui.*, dan ONT TIDAK disentuh.
// - Sebelum mengubah apa pun dibuat snapshot; kalau gagal otomatis dikembalikan. Ada aksi "rollback".
"use strict";
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const crypto = require("crypto");
const os = require("os");

const VERSION = 1;
const CONF_FILE = process.env.GM_UPDATER_CONF || "/etc/genieacs-multitab/updater.conf";
const C = {
  repo: "https://github.com/s4lfanet/Genieacs-Multitab.git", branch: "main", dir: "/opt/genieacs-multitab",
  state: "/var/lib/genieacs-multitab", db: "genieacs", public: "", uipatch: "", botdir: "", waService: "genieacs-wa-bot",
  uiUrl: "http://127.0.0.1:3000/", pollSeconds: 8, autoCheckHours: 6
};
try { Object.assign(C, JSON.parse(fs.readFileSync(CONF_FILE, "utf8"))); } catch (e) { console.error("config " + CONF_FILE + ": " + e.message + " (pakai bawaan)"); }
if (!/^[A-Za-z0-9._\/-]+$/.test(C.branch)) { console.error("branch tidak valid"); process.exit(1); }
if (/\s/.test(C.repo)) { console.error("repo tidak valid"); process.exit(1); }

// ---------- util ----------
const LOGS = [];
function ts() { return new Date().toISOString().replace("T", " ").slice(0, 19); }
function log(msg) {
  String(msg).split(/\r?\n/).forEach((l) => {
    l = l.replace(/\u001b\[[0-9;]*m/g, "").trimRight();
    if (!l) return;
    const line = ts() + " " + l.slice(0, 220);
    console.log(line);
    LOGS.push(line); while (LOGS.length > 60) LOGS.shift();
    try { fs.appendFileSync(path.join(C.state, "updater.log"), line + "\n"); } catch (e) { /* abaikan */ }
  });
}
function rmrf(p) { try { if (fs.rmSync) fs.rmSync(p, { recursive: true, force: true }); else fs.rmdirSync(p, { recursive: true }); } catch (e) { /* tidak ada */ } }
function sha256(f) { try { return crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex"); } catch (e) { return ""; } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- MongoDB (shell mongo/mongosh, seperti core.js) ----------
let MONGO = null;
function mongoBin() {
  if (MONGO) return MONGO;
  for (const b of ["mongosh", "mongo"]) { try { cp.execFileSync(b, ["--version"], { stdio: "ignore" }); MONGO = b; return b; } catch (e) { /* berikutnya */ } }
  throw new Error("shell mongo tidak ditemukan");
}
function mongo(js) { return cp.execFileSync(mongoBin(), ["--quiet", C.db, "--eval", js], { encoding: "utf8", timeout: 20000 }).trim(); }
function cfgGet(id) { return mongo("var d=db.config.findOne({_id:" + JSON.stringify(id) + '});print(d?String(d.value):"")').split("\n").pop().trim(); }
function cfgSet(id, value) { mongo("db.config.updateOne({_id:" + JSON.stringify(id) + "},{$set:{value:" + JSON.stringify(value) + "}},{upsert:true})"); }
// beberapa key Config sekaligus dalam SATU panggilan mongo (tick jalan tiap beberapa detik)
function cfgGetMany(ids) {
  const out = mongo("var o={};" + JSON.stringify(ids) + '.forEach(function(i){var d=db.config.findOne({_id:i});o[i]=d?String(d.value):""});print(JSON.stringify(o))');
  try { return JSON.parse(out.split("\n").pop()); } catch (e) { return {}; }
}
const enc = (o) => "'" + Buffer.from(JSON.stringify(o)).toString("base64") + "'";
function dec(v) {
  v = String(v || "").trim(); if (v.length < 2 || v[0] !== "'" || v[v.length - 1] !== "'") return null;
  try { return JSON.parse(Buffer.from(v.slice(1, -1), "base64").toString("utf8")); } catch (e) { return null; }
}

// ---------- git ----------
function git(args, opt) {
  return cp.execFileSync("git", ["-C", C.dir].concat(args), Object.assign({ encoding: "utf8", timeout: 180000,
    env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: "0" }) }, opt || {})).trim();
}
function commit(ref) {
  const p = git(["log", "-1", "--format=%H%x1f%cs%x1f%s", ref]).split("\x1f");
  return { sha: p[0], short: p[0].slice(0, 7), date: p[1], subject: (p[2] || "").slice(0, 140) };
}
function ensureCheckout() {
  if (fs.existsSync(path.join(C.dir, ".git"))) return;
  log("clone " + C.repo + " -> " + C.dir);
  fs.mkdirSync(path.dirname(C.dir), { recursive: true });
  cp.execFileSync("git", ["clone", "--quiet", "--branch", C.branch, C.repo, C.dir], { encoding: "utf8", timeout: 300000, env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: "0" }) });
}

// ---------- status ----------
const ST = path.join(C.state, "state.json");
let state = { lastId: "", prevSha: "" };
try { state = Object.assign(state, JSON.parse(fs.readFileSync(ST, "utf8"))); } catch (e) { /* baru */ }
function saveState() { try { fs.mkdirSync(C.state, { recursive: true, mode: 0o700 }); fs.writeFileSync(ST, JSON.stringify(state), { mode: 0o600 }); } catch (e) { log("simpan state gagal: " + e.message); } }
const S = { v: VERSION, state: "idle", current: null, remote: null, behind: 0, commits: [], checkedAt: 0, lastResult: null,
  installed: { flags: [], wa: false }, canRollback: false, warn: "", log: [], updated: 0 };
function publish() {
  S.log = LOGS.slice(-40); S.updated = Date.now();
  try { cfgSet("update.status", enc(S)); } catch (e) { console.error("publish gagal: " + e.message); }
}

// ---------- komponen terpasang ----------
function pubDir() {
  if (C.public) return C.public;
  return ["/usr/local/lib/node_modules/genieacs/public", "/usr/lib/node_modules/genieacs/public", "/opt/genieacs/dist/public"].find((p) => fs.existsSync(p)) || "";
}
function appJs(pub) {
  try { const f = fs.readdirSync(pub).filter((x) => /^app-[A-Za-z0-9]+\.js$/.test(x)); return f.length ? path.join(pub, f[0]) : ""; } catch (e) { return ""; }
}
const PAGES = [["peta.html", "--map"], ["bot.html", "--botpage"], ["wa.html", "--wapage"], ["status.html", "--status"]];
function installedFlags() {
  const pub = pubDir(), js = appJs(pub), f = [];
  if (!pub || !js) return f;
  PAGES.forEach((p) => { if (fs.existsSync(path.join(pub, p[0]))) f.push(p[1]); });
  try { if (fs.readFileSync(js, "utf8").indexOf("acs-theme-btn") >= 0) f.push("--theme"); } catch (e) { /* abaikan */ }
  f.push("--update"); // layanan ini ada, jadi halaman Update selalu ikut
  if (f.indexOf("--status") < 0) f.push("--status"); // dan halaman Status (datanya dari layanan ini)
  return f;
}
function waFiles() { return C.botdir && fs.existsSync(path.join(C.botdir, "wa.js")); }
function refreshInstalled() { S.installed = { flags: installedFlags(), wa: !!waFiles() }; }

// ---------- operasi ----------
function check() {
  git(["fetch", "--quiet", "origin", C.branch]);
  S.current = commit("HEAD");
  S.remote = commit("origin/" + C.branch);
  S.behind = parseInt(git(["rev-list", "--count", "HEAD..origin/" + C.branch]), 10) || 0;
  S.commits = S.behind ? git(["log", "-n", "15", "--format=%H%x1f%cs%x1f%s", "HEAD..origin/" + C.branch]).split("\n").filter(Boolean).map((l) => {
    const p = l.split("\x1f"); return { short: p[0].slice(0, 7), date: p[1], subject: (p[2] || "").slice(0, 140) };
  }) : [];
  S.warn = git(["status", "--porcelain"]) ? "Checkout lokal memiliki perubahan manual; update ditolak sampai dibersihkan." : "";
  S.checkedAt = Date.now();
  refreshInstalled();
  S.canRollback = fs.existsSync(path.join(C.state, "prev", "meta.json"));
}
function health() {
  for (let i = 0; i < 3; i++) {
    let code = "";
    try { code = cp.execFileSync("curl", ["-s", "-o", "/dev/null", "-m", "10", "-w", "%{http_code}", C.uiUrl], { encoding: "utf8", timeout: 15000 }).trim(); } catch (e) { /* kode kosong */ }
    if (code !== "200") return false;
    cp.execFileSync("sleep", ["1"]);
  }
  return true;
}

// snapshot file yang akan diubah, supaya bisa dikembalikan
function snapshot(comps) {
  const prev = path.join(C.state, "prev");
  rmrf(prev); fs.mkdirSync(path.join(prev, "ui"), { recursive: true }); fs.mkdirSync(path.join(prev, "wa"), { recursive: true });
  const pub = pubDir(), js = appJs(pub), meta = { sha: git(["rev-parse", "HEAD"]), at: Date.now(), ui: [], absent: [], wa: [] };
  if (js) { fs.copyFileSync(js, path.join(prev, "ui", path.basename(js))); meta.ui.push(path.basename(js)); }
  PAGES.map((p) => p[0]).concat(["update.html"]).forEach((n) => {
    const f = path.join(pub, n);
    if (fs.existsSync(f)) { fs.copyFileSync(f, path.join(prev, "ui", n)); meta.ui.push(n); } else meta.absent.push(n);
  });
  if (comps.indexOf("wa") >= 0 && waFiles()) ["wa.js", "core.js", "wa-page.html"].forEach((n) => {
    const f = path.join(C.botdir, n);
    if (fs.existsSync(f)) { fs.copyFileSync(f, path.join(prev, "wa", n)); meta.wa.push(n); }
  });
  fs.writeFileSync(path.join(prev, "meta.json"), JSON.stringify(meta));
  return meta;
}
function restore(meta) {
  const prev = path.join(C.state, "prev"), pub = pubDir();
  (meta.ui || []).forEach((n) => fs.copyFileSync(path.join(prev, "ui", n), path.join(pub, n)));
  (meta.absent || []).forEach((n) => rmrf(path.join(pub, n)));
  if (meta.wa && meta.wa.length) {
    const own = fs.statSync(C.botdir);
    meta.wa.forEach((n) => { const d = path.join(C.botdir, n); fs.copyFileSync(path.join(prev, "wa", n), d); try { fs.chownSync(d, own.uid, own.gid); } catch (e) { /* abaikan */ } });
    restartWa();
  }
}
function runUi() {
  const flags = installedFlags();
  log("pasang tampilan: ui-admin-menu.sh " + flags.join(" "));
  const env = Object.assign({}, process.env, { GENIEACS_PUBLIC: pubDir(), UIPATCH_DIR: C.uipatch || path.join(process.env.HOME || "/root", "genieacs-uipatch"), UI_URL: C.uiUrl });
  const r = cp.spawnSync("bash", [path.join(C.dir, "scripts", "ui-admin-menu.sh")].concat(flags), { cwd: C.dir, env: env, encoding: "utf8", timeout: 300000 });
  log((r.stdout || "").split("\n").slice(-8).join("\n"));
  if (r.stderr) log(r.stderr.split("\n").slice(-4).join("\n"));
  if (r.status !== 0) throw new Error("ui-admin-menu.sh gagal (kode " + r.status + ")");
}
function restartWa() {
  try { cp.execFileSync("systemctl", ["restart", C.waService], { timeout: 60000 }); } catch (e) { log("restart " + C.waService + " gagal: " + e.message); }
}
async function updateWa() {
  if (!waFiles()) { log("bot WA tidak terpasang di " + (C.botdir || "-") + ", dilewati"); return; }
  const src = path.join(C.dir, "bot");
  if (sha256(path.join(src, "package.json")) !== sha256(path.join(C.botdir, "package.json")))
    throw new Error("package.json bot WA berubah di versi baru; jalankan scripts/setup-wa-bot.sh secara manual");
  const own = fs.statSync(C.botdir); let changed = 0;
  ["wa.js", "core.js", "wa-page.html"].forEach((n) => {
    if (sha256(path.join(src, n)) === sha256(path.join(C.botdir, n))) return;
    const d = path.join(C.botdir, n); fs.copyFileSync(path.join(src, n), d); try { fs.chownSync(d, own.uid, own.gid); } catch (e) { /* abaikan */ } changed++;
  });
  if (!changed) { log("file bot WA sudah terbaru"); return; }
  log("file bot WA diperbarui (" + changed + "), restart " + C.waService);
  restartWa(); await sleep(8000);
  let act = ""; try { act = cp.execFileSync("systemctl", ["is-active", C.waService], { encoding: "utf8" }).trim(); } catch (e) { act = String((e.stdout || "")).trim(); }
  if (act !== "active") throw new Error(C.waService + " tidak aktif sesudah update (" + act + ")");
}

async function apply(comps) {
  S.state = "updating"; publish();
  const self0 = sha256(__filename);
  ensureCheckout(); check();
  if (S.warn) throw new Error(S.warn);
  const before = S.current.sha, target = S.remote.sha;
  log("update " + S.current.short + " -> " + S.remote.short + " (komponen: " + comps.join(", ") + ")");
  const meta = snapshot(comps);
  try {
    if (before !== target) git(["merge", "--ff-only", "origin/" + C.branch]);
    runUi();
    if (comps.indexOf("wa") >= 0) await updateWa();
    if (!health()) throw new Error("UI GenieACS tidak sehat sesudah update");
  } catch (e) {
    log("GAGAL: " + e.message + " -> mengembalikan versi sebelumnya");
    try { restore(meta); if (git(["rev-parse", "HEAD"]) !== before) git(["reset", "--hard", before]); log("dikembalikan ke " + before.slice(0, 7)); } catch (e2) { log("pengembalian GAGAL: " + e2.message); }
    throw e;
  }
  state.prevSha = before; saveState();
  check();
  S.lastResult = { ok: true, action: "apply", at: Date.now(), from: before.slice(0, 7), to: S.current.short, message: before === target ? "Sudah versi terbaru; komponen dipasang ulang." : "Berhasil diperbarui. Tekan Ctrl+F5 di browser." };
  log("selesai: " + S.lastResult.message);
  return sha256(__filename) !== self0; // updater sendiri berubah -> keluar supaya systemd menjalankan versi baru
}
async function rollback() {
  S.state = "rollingback"; publish();
  const f = path.join(C.state, "prev", "meta.json");
  if (!fs.existsSync(f)) throw new Error("tidak ada snapshot untuk dikembalikan");
  const meta = JSON.parse(fs.readFileSync(f, "utf8")), cur = git(["rev-parse", "HEAD"]);
  log("rollback ke " + meta.sha.slice(0, 7));
  restore(meta);
  git(["reset", "--hard", meta.sha]);
  if (!health()) log("PERINGATAN: UI belum menjawab 200 sesudah rollback");
  rmrf(path.join(C.state, "prev"));
  check();
  S.lastResult = { ok: true, action: "rollback", at: Date.now(), from: cur.slice(0, 7), to: meta.sha.slice(0, 7), message: "Dikembalikan ke versi sebelumnya. Tekan Ctrl+F5 di browser." };
  return true;
}

// ---------- status layanan GenieACS (untuk halaman Status) ----------
const SVC = [
  { id: "ui", label: "UI", unit: "genieacs-ui", port: 3000, url: "/status", role: "Antarmuka web GenieACS", okCodes: ["200"] },
  { id: "cwmp", label: "CWMP", unit: "genieacs-cwmp", port: 7547, url: "/", role: "Server TR-069: tempat ONT melakukan inform", anyHttp: true },
  { id: "nbi", label: "NBI", unit: "genieacs-nbi", port: 7557, url: "/devices/?limit=1&projection=_id", role: "API untuk bot dan integrasi", okCodes: ["200"] },
  { id: "fs", label: "FS", unit: "genieacs-fs", port: 7567, url: "/", role: "File server firmware & konfigurasi", anyHttp: true }
];
const EXTRA = [
  { id: "mongod", label: "MongoDB", unit: "mongod", alt: "mongodb" },
  { id: "bot", label: "Bot Telegram", unit: "genieacs-bot" },
  { id: "wabot", label: "Bot WhatsApp", unit: "genieacs-wa-bot" },
  { id: "updater", label: "Updater", unit: "genieacs-multitab-updater" }
];
function unitInfo(unit) {
  const r = { unit: unit, load: "", active: "", sub: "", pid: 0, up: null, mem: null, restarts: null };
  try {
    cp.execFileSync("systemctl", ["show", unit, "-p", "LoadState,ActiveState,SubState,MainPID,MemoryCurrent,NRestarts", "--no-pager"], { encoding: "utf8", timeout: 5000 })
      .split("\n").forEach((l) => {
        const i = l.indexOf("="); if (i < 0) return; const k = l.slice(0, i), v = l.slice(i + 1);
        if (k === "LoadState") r.load = v; else if (k === "ActiveState") r.active = v; else if (k === "SubState") r.sub = v;
        else if (k === "MainPID") r.pid = parseInt(v, 10) || 0;
        else if (k === "MemoryCurrent") r.mem = /^\d+$/.test(v) && v !== "18446744073709551615" ? parseInt(v, 10) : null;
        else if (k === "NRestarts") r.restarts = /^\d+$/.test(v) ? parseInt(v, 10) : null;
      });
    if (r.pid) { // lama berjalan (detik) dari lama proses (etimes): tidak bergantung zona waktu maupun beda jam browser
      const e = parseInt(cp.execFileSync("ps", ["-o", "etimes=", "-p", String(r.pid)], { encoding: "utf8", timeout: 3000 }).trim(), 10);
      if (e >= 0) r.up = e;
    }
  } catch (e) { r.load = r.load || "error"; }
  return r;
}
function probe(port, url) {
  const t0 = Date.now(); let code = "";
  try { code = cp.execFileSync("curl", ["-s", "-o", "/dev/null", "-m", "4", "-w", "%{http_code}", "http://127.0.0.1:" + port + url], { encoding: "utf8", timeout: 6000 }).trim(); } catch (e) { /* tak terjangkau */ }
  return { code: code, ms: Date.now() - t0 };
}
function disk() {
  try {
    const l = cp.execFileSync("df", ["-Pk", "/"], { encoding: "utf8", timeout: 4000 }).trim().split("\n").pop().split(/\s+/);
    return { total: parseInt(l[1], 10) * 1024, free: parseInt(l[3], 10) * 1024 };
  } catch (e) { return null; }
}
function collectHealth() {
  const ports = C.ports || {};
  const services = SVC.map((s) => {
    const u = unitInfo(C.units && C.units[s.id] || s.unit), port = ports[s.id] || s.port, p = probe(port, s.url);
    const ok = s.anyHttp ? !!p.code && p.code !== "000" : s.okCodes.indexOf(p.code) >= 0;
    return Object.assign({ id: s.id, label: s.label, role: s.role, port: port, probe: { code: p.code, ms: p.ms, ok: ok } }, u);
  });
  const extra = EXTRA.map((s) => {
    let u = unitInfo(s.unit); if (u.load === "not-found" && s.alt) u = unitInfo(s.alt);
    return Object.assign({ id: s.id, label: s.label }, u);
  }).filter((x) => x.load !== "not-found");
  let db = null;
  try { db = JSON.parse(mongo('print(JSON.stringify({d:db.devices.count(),o:db.devices.count({_lastInform:{$gt:new Date(Date.now()-600000)}}),f:db.faults.count()}))').split("\n").pop()); } catch (e) { /* abaikan */ }
  return { v: 1, at: Date.now(), host: os.hostname(), uptime: os.uptime(), load: os.loadavg(), cpus: os.cpus().length,
    mem: { total: os.totalmem(), free: os.freemem() }, disk: disk(), services: services, extra: extra, db: db };
}
let lastHealth = 0, lastWatchVal = null, lastWatchChange = 0;
function healthTick(force) {
  lastHealth = Date.now();
  try { cfgSet("sys.status", enc(collectHealth())); } catch (e) { log("status layanan gagal: " + e.message); }
}

// ---------- permintaan dari halaman ----------
function validRequest(r) {
  if (!r || typeof r !== "object") return null;
  if (typeof r.id !== "string" || !/^[A-Za-z0-9_-]{6,48}$/.test(r.id)) return null;
  if (["check", "apply", "rollback"].indexOf(r.a) < 0) return null;
  let c = ["ui"];
  if (Array.isArray(r.c)) { if (r.c.some((x) => ["ui", "wa"].indexOf(x) < 0)) return null; c = ["ui"].concat(r.c.indexOf("wa") >= 0 ? ["wa"] : []); }
  return { id: r.id, a: r.a, c: c };
}
let busy = false, lastCheckReq = 0, exitAfter = false;
async function handle(req) {
  busy = true;
  try {
    if (req.a === "check") {
      if (Date.now() - lastCheckReq < 10000) { log("check diabaikan (terlalu sering)"); return; }
      lastCheckReq = Date.now(); S.state = "checking"; publish(); ensureCheckout(); check();
      S.lastResult = { ok: true, action: "check", at: Date.now(), message: S.behind ? S.behind + " pembaruan tersedia." : "Sudah versi terbaru." };
      log(S.lastResult.message);
    } else if (req.a === "apply") exitAfter = await apply(req.c);
    else if (req.a === "rollback") await rollback();
  } catch (e) {
    S.lastResult = { ok: false, action: req.a, at: Date.now(), message: String(e.message).slice(0, 300) };
    log("ERROR " + req.a + ": " + e.message);
    try { check(); } catch (e2) { /* abaikan */ }
  } finally { S.state = "idle"; busy = false; publish(); }
  if (exitAfter) { log("updater diperbarui, restart layanan"); setTimeout(() => process.exit(0), 500); }
}

let lastHb = 0, lastAuto = 0;
async function tick() {
  if (busy) return;
  try {
    if (Date.now() - lastHb > 120000) { cfgSet("update.hb", "'" + Date.now() + "'"); lastHb = Date.now(); }
    const cfg = cfgGetMany(["update.request", "sys.watch"]);
    // halaman Status menulis nilai yang selalu berubah tiap ±20 dtk selama dibuka; dinilai dengan jam server (tahan beda jam browser)
    if (cfg["sys.watch"] !== lastWatchVal) { lastWatchVal = cfg["sys.watch"]; lastWatchChange = Date.now(); }
    const watching = Date.now() - lastWatchChange < 45000;
    if (watching ? Date.now() - lastHealth >= 9000 : Date.now() - lastHealth > 300000) healthTick();
    const req = validRequest(dec(cfg["update.request"]));
    if (req && req.id !== state.lastId) { state.lastId = req.id; saveState(); log("permintaan: " + req.a + " (" + req.c.join(",") + ")"); await handle(req); return; }
    if (Date.now() - lastAuto > C.autoCheckHours * 3600e3) {
      lastAuto = Date.now(); ensureCheckout(); check(); publish();
    }
  } catch (e) { log("tick: " + e.message); }
}

async function main() {
  fs.mkdirSync(C.state, { recursive: true, mode: 0o700 });
  log("updater v" + VERSION + " mulai (repo " + C.repo + " @" + C.branch + ", dir " + C.dir + ", db " + C.db + ")");
  ensureCheckout();
  // permintaan yang sudah ada saat start dianggap sudah ditangani (jangan dijalankan ulang setelah restart/mati)
  try { const r = validRequest(dec(cfgGet("update.request"))); if (r) { state.lastId = r.id; saveState(); } } catch (e) { /* belum ada */ }
  try { check(); S.canRollback = fs.existsSync(path.join(C.state, "prev", "meta.json")); } catch (e) { log("check awal gagal: " + e.message); refreshInstalled(); }
  lastAuto = Date.now(); publish(); healthTick();
  setInterval(() => { tick(); }, C.pollSeconds * 1000);
}
if (process.argv[2] === "--selftest-health") { console.log(JSON.stringify(collectHealth(), null, 1)); process.exit(0); }
if (process.argv[2] === "--selftest") { console.log(JSON.stringify({ conf: C, installed: installedFlags(), wa: !!waFiles() })); process.exit(0); }
main().catch((e) => { console.error("FATAL " + (e.stack || e.message)); process.exit(1); });
