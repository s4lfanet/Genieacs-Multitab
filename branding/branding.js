#!/usr/bin/env node
// Branding header GenieACS dari Admin -> Config (branding.*) dan Admin -> Files (logo).
// Hanya menulis 2 file: logo-*.svg dan app-*.css di public/. Salinan asli disimpan di ./orig/.
// Pakai: node branding.js          (sinkron, dijalankan cron tiap menit)
//        node branding.js restore  (kembalikan logo & CSS asli)
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const PUB = process.env.GENIEACS_PUBLIC || ["/usr/local/lib/node_modules/genieacs/public", "/usr/lib/node_modules/genieacs/public", "/opt/genieacs/dist/public"].find(p => fs.existsSync(p));
const DIR = __dirname;
const ORIG = path.join(DIR, "orig");
const STATE = path.join(DIR, "state.json");
const MARK_A = "/*BRANDING-START*/";
const MARK_B = "/*BRANDING-END*/";

function log(m) { console.log(new Date().toISOString() + " " + m); }
function pick(re) {
  const f = fs.readdirSync(PUB).filter(n => re.test(n));
  if (f.length !== 1) throw new Error("file tidak unik: " + re + " -> " + f.join(","));
  return path.join(PUB, f[0]);
}
const LOGO = pick(/^logo-[0-9a-f]+\.svg$/);
const CSS = pick(/^app-[A-Z0-9]+\.css$/);

function ensureOrig() {
  if (!fs.existsSync(ORIG)) fs.mkdirSync(ORIG);
  for (const f of [LOGO, CSS]) {
    const o = path.join(ORIG, path.basename(f));
    if (!fs.existsSync(o)) {
      const s = fs.readFileSync(f);
      if (s.includes(MARK_A)) throw new Error("file asli sudah termodifikasi: " + f);
      fs.writeFileSync(o, s);
    }
  }
}
function orig(f) { return fs.readFileSync(path.join(ORIG, path.basename(f))); }
function writeIfChanged(f, buf) {
  const cur = fs.readFileSync(f);
  if (Buffer.compare(cur, buf) === 0) return false;
  fs.writeFileSync(f, buf); // folder milik root: tulis langsung ke file (sudah di-chown)
  return true;
}

function readConfig() {
  const out = execFileSync("mongo", ["genieacs", "--quiet", "--eval",
    'var o={};db.config.find({_id:/^branding\\./}).forEach(function(d){o[d._id]=d.value});' +
    'var l=o["branding.logo"];l=l?l.replace(/^[\'"]|[\'"]$/g,""):"";' +
    'var f=l?db.fs.files.findOne({_id:l}):null;o.__file=f?{len:f.length,date:f.uploadDate}:null;print(JSON.stringify(o))'],
    {encoding: "utf8", timeout: 20000});
  const o = JSON.parse(out.trim().split("\n").pop());
  const v = k => (typeof o[k] === "string" ? o[k].trim().replace(/^'(.*)'$|^"(.*)"$/s, "$1$2") : "");
  return {title: v("branding.title"), subtitle: v("branding.subtitle"), color: v("branding.headerColor"),
    textColor: v("branding.textColor"), logo: v("branding.logo"), file: o.__file};
}

function clean(s, max) { return s.replace(/["\\<>{};\r\n]/g, "").slice(0, max); }
function color(s) { return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : ""; }

function fetchFile(name) {
  return new Promise((res, rej) => {
    http.get({host: "127.0.0.1", port: 7567, path: "/" + encodeURIComponent(name), timeout: 15000}, r => {
      if (r.statusCode !== 200) { r.resume(); return rej(new Error("FS " + r.statusCode)); }
      const ch = []; let n = 0;
      r.on("data", d => { n += d.length; if (n > 2 * 1024 * 1024) { r.destroy(); rej(new Error("logo > 2MB")); } else ch.push(d); });
      r.on("end", () => res(Buffer.concat(ch)));
    }).on("error", rej).on("timeout", function () { this.destroy(new Error("timeout")); });
  });
}

function imageInfo(b) {
  if (b.slice(0, 8).toString("hex") === "89504e470d0a1a0a") return {mime: "image/png", w: b.readUInt32BE(16), h: b.readUInt32BE(20)};
  if (b.slice(0, 4).toString("ascii") === "GIF8") return {mime: "image/gif", w: b.readUInt16LE(6), h: b.readUInt16LE(8)};
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return {mime: "image/jpeg", h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7)};
      i += 2 + len;
    }
    return {mime: "image/jpeg", w: 400, h: 100};
  }
  if (b.slice(0, 4).toString("ascii") === "RIFF" && b.slice(8, 12).toString("ascii") === "WEBP") return {mime: "image/webp", w: 400, h: 100};
  const t = b.slice(0, 500).toString("utf8");
  if (/<svg[\s>]/i.test(t)) {
    const vb = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(b.toString("utf8"));
    return {mime: "image/svg+xml", w: vb ? +vb[1] : 400, h: vb ? +vb[2] : 100};
  }
  return null;
}

function logoSvg(buf) {
  const inf = imageInfo(buf);
  if (!inf || !(inf.w > 0) || !(inf.h > 0)) throw new Error("format logo tidak dikenal (pakai PNG/JPG/GIF/SVG/WEBP)");
  const uri = "data:" + inf.mime + ";base64," + buf.toString("base64");
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + inf.w +
    '" height="' + inf.h + '" viewBox="0 0 ' + inf.w + " " + inf.h + '"><image width="' + inf.w + '" height="' + inf.h +
    '" href="' + uri + '" xlink:href="' + uri + '"/></svg>');
}

function brandCss(c) {
  const r = [];
  const bg = color(c.color), tc = color(c.textColor) || "#2d3748";
  if (bg) r.push("#header{background-color:" + bg + "}");
  if (c.logo) r.push("#header>.logo>img{max-width:260px;object-fit:contain}");
  const sub = clean(c.subtitle, 40);
  if (sub) r.push("#header>.logo>.version{font-size:0}#header>.logo>.version::after{content:\"" + sub + "\";font-size:11px;color:" + tc + "}");
  const title = clean(c.title, 40);
  if (title) r.push("#header>.logo::after{content:\"" + title + "\";display:inline-block;vertical-align:top;margin:26px 24px 0 4px;font-size:22px;font-weight:700;color:" + tc + "}");
  return r.length ? "\n" + MARK_A + r.join("") + MARK_B + "\n" : "";
}

async function main() {
  ensureOrig();
  if (process.argv[2] === "restore") {
    const a = writeIfChanged(LOGO, orig(LOGO)), b = writeIfChanged(CSS, orig(CSS));
    try { fs.unlinkSync(STATE); } catch (e) {}
    return log("restore: logo " + (a ? "dikembalikan" : "sudah asli") + ", css " + (b ? "dikembalikan" : "sudah asli"));
  }
  const c = readConfig();
  const key = crypto.createHash("sha1").update(JSON.stringify(c)).digest("hex");
  let st = {};
  try { st = JSON.parse(fs.readFileSync(STATE, "utf8")); } catch (e) {}
  const filesIntact = fs.readFileSync(CSS).includes(MARK_A) === (brandCss(c) !== "");
  if (st.key === key && filesIntact) return;

  let logoBuf = orig(LOGO), logoNote = "logo asli";
  if (c.logo && c.file) {
    try { logoBuf = logoSvg(await fetchFile(c.logo)); logoNote = "logo " + c.logo + " (" + c.file.len + " byte)"; }
    catch (e) { logoNote = "logo gagal: " + e.message + " -> pakai logo asli"; }
  } else if (c.logo) logoNote = "logo " + c.logo + " belum ada di Admin -> Files -> pakai logo asli";

  const cssBuf = Buffer.concat([orig(CSS), Buffer.from(brandCss(c))]);
  const a = writeIfChanged(LOGO, logoBuf), b = writeIfChanged(CSS, cssBuf);
  fs.writeFileSync(STATE, JSON.stringify({key: key, at: new Date().toISOString()}));
  log("sinkron: " + logoNote + (a ? " [logo ditulis]" : "") + (b ? " [css ditulis]" : "") +
    " title=" + JSON.stringify(c.title) + " subtitle=" + JSON.stringify(c.subtitle) + " color=" + JSON.stringify(c.color));
}
main().catch(e => { log("ERROR " + e.message); process.exitCode = 1; });
