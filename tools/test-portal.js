#!/usr/bin/env node
// Uji portal pelanggan (bot/portal.js) dengan NBI tiruan dan jam palsu: node tools/test-portal.js
// Tidak menyentuh GenieACS/MongoDB sungguhan. Menulis bot/audit.log (diabaikan git); dihapus di akhir bila tadinya tidak ada.
"use strict";
const http = require("http"), fs = require("fs"), path = require("path");
const BOT = path.join(__dirname, "..", "bot");
const AUDIT = path.join(BOT, "audit.log"), hadAudit = fs.existsSync(AUDIT);
const { createPortal, startServer, normPhone, tagPhone } = require(path.join(BOT, "portal.js"));

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log("  PASS  " + n); } else { fail++; console.log("  FAIL  " + n); } };
const eq = (a, b, n) => ok(JSON.stringify(a) === JSON.stringify(b), n + (JSON.stringify(a) === JSON.stringify(b) ? "" : " (dapat " + JSON.stringify(a) + ", mau " + JSON.stringify(b) + ")"));

const V = (x) => ({ _value: x });
const dev = (id, tags, user, ssid) => ({ _id: id, _tags: tags, _lastInform: new Date().toISOString(), _deviceId: { _ProductClass: "F670L" },
  VirtualParameters: { pppoeUsername: V(user), RXPower: V("-17.2") },
  InternetGatewayDevice: { LANDevice: { 1: { WLANConfiguration: {
    1: { SSID: V(ssid), Enable: V(true), OperatingFrequencyBand: V("2.4GHz"), PreSharedKey: { 1: { KeyPassphrase: V("rahasia-lama") } } },
    5: { SSID: V(ssid + "-5G"), Enable: V(true), OperatingFrequencyBand: V("5GHz"), PreSharedKey: { 1: { KeyPassphrase: V("rahasia-lama") } } } } } } } });
const DEVS = [dev("A-1", ["wa:081111111111", "LOC_-6330000_108320000"], "andi@rw01", "Andi"), dev("B-2", ["082222222222"], "budi@rw02", "Budi"),
  dev("C-3", ["083333333333"], "cici@rw03", "Cici"), dev("D-4", ["wa:083333333333"], "dedi@rw04", "Dedi"), dev("E-5", ["VIP"], "eko@rw05", "Eko")];
const tasks = [];

const nbi = http.createServer((q, r) => {
  let b = ""; q.on("data", (c) => b += c); q.on("end", () => {
    const u = new URL(q.url, "http://x"), js = (o, c) => { r.statusCode = c || 200; r.setHeader("content-type", "application/json"); r.end(JSON.stringify(o)); };
    if (u.pathname.indexOf("/devices/") === 0 && u.pathname.endsWith("/tasks") && q.method === "POST") { tasks.push({ id: decodeURIComponent(u.pathname.split("/")[2]), body: JSON.parse(b) }); return js({ _id: "t" + tasks.length }); }
    if (u.pathname === "/devices/" ) { const qq = JSON.parse(u.searchParams.get("query") || "{}"); return js(DEVS.filter((d) => !qq._id || d._id === qq._id)); }
    if (u.pathname === "/faults/") return js([]);
    js({}, 404);
  });
});

(async () => {
  await new Promise((r) => nbi.listen(0, "127.0.0.1", r));
  const NBI = "http://127.0.0.1:" + nbi.address().port;
  let t = 1000000, sent = [];
  const mk = (extra) => createPortal(Object.assign({ nbi: NBI, now: () => t, settings: () => ({ enabled: true, brand: "TesNet", maxActionsPerDay: 3 }), send: async (p, text) => { sent.push({ p, text }); } }, extra));
  const code = () => (sent[sent.length - 1].text.match(/\*(\d{6})\*/) || [])[1];

  console.log("T1 normalisasi nomor & tag");
  eq(normPhone("0812-3456-7890"), "6281234567890", "08.. -> 62..");
  eq(normPhone("+62 812 3456 7890"), "6281234567890", "+62 dengan spasi");
  eq(normPhone("812345678"), "62812345678", "8.. -> 628..");
  eq(normPhone("abc"), "", "bukan nomor ditolak");
  eq(normPhone("'; drop"), "", "karakter aneh ditolak");
  eq([tagPhone("wa:0812345678"), tagPhone("08123456789"), tagPhone("LOC_-6330000_108320000"), tagPhone("VIP"), tagPhone("ODP_ODP-01_-6331000_108321000")], ["62812345678", "628123456789", "", "", ""], "hanya tag nomor yang dikenali (LOC_/ODP_/VIP diabaikan)");

  console.log("T2 minta OTP: terdaftar vs tidak terdaftar tak bisa dibedakan");
  let p = mk(), a = await p.requestOtp("1.1.1.1", "081111111111"), n1 = sent.length;
  const b = await p.requestOtp("1.1.1.2", "089999999999");
  eq(a.body, b.body, "respons identik (terdaftar/tidak)"); eq(a.status, b.status, "status identik");
  eq(n1, 1, "OTP terkirim hanya untuk nomor terdaftar"); eq(sent.length, 1, "nomor tak terdaftar tidak mengirim apa pun");
  ok(/^\d{6}$/.test(code()), "kode 6 digit"); eq(sent[0].p, "6281111111111", "dikirim ke nomor ter-normalisasi");

  console.log("T3 nomor cocok >1 ONT ditolak diam-diam");
  sent = []; p = mk(); await p.requestOtp("2.2.2.2", "083333333333"); eq(sent.length, 0, "nomor ganda tidak dikirimi OTP");
  sent = []; await p.requestOtp("2.2.2.3", "082222222222"); eq(sent.length, 1, "nomor tunggal normal");

  console.log("T4 tebak OTP: maksimal 3 kali, kode benar sesudahnya tetap hangus");
  sent = []; p = mk(); await p.requestOtp("3.3.3.3", "081111111111"); const c4 = code(), wrong = c4 === "000000" ? "111111" : "000000";
  eq(p.verifyOtp("3.3.3.3", "081111111111", wrong).status, 401, "salah #1"); eq(p.verifyOtp("3.3.3.3", "081111111111", wrong).status, 401, "salah #2");
  eq(p.verifyOtp("3.3.3.3", "081111111111", wrong).status, 401, "salah #3");
  eq(p.verifyOtp("3.3.3.3", "081111111111", c4).status, 401, "kode BENAR setelah 3 salah tetap ditolak");
  eq(p.verifyOtp("3.3.3.3", "081111111111", "12ab56").status, 401, "format kode tidak valid ditolak");

  console.log("T5 login benar, replay, kedaluwarsa");
  sent = []; p = mk(); await p.requestOtp("4.4.4.4", "081111111111"); const c5 = code();
  const v = p.verifyOtp("4.4.4.4", "081111111111", c5); eq(v.status, 200, "kode benar -> sesi"); ok(/^[0-9a-f]{64}$/.test(v.body.token), "token 256-bit acak");
  eq(p.verifyOtp("4.4.4.4", "081111111111", c5).status, 401, "kode dipakai ulang ditolak");
  sent = []; t += 70000; await p.requestOtp("4.4.4.5", "081111111111"); const c5b = code(); t += 6 * 60000;
  eq(p.verifyOtp("4.4.4.5", "081111111111", c5b).status, 401, "OTP kedaluwarsa (6 menit) ditolak");

  console.log("T6 sesi terikat ke satu ONT; tidak ada cara memilih ONT lain");
  sent = []; p = mk(); t += 1000;
  await p.requestOtp("5.5.5.5", "081111111111"); const tokA = p.verifyOtp("5.5.5.5", "081111111111", code()).body.token;
  await p.requestOtp("5.5.5.6", "082222222222"); const tokB = p.verifyOtp("5.5.5.6", "082222222222", code()).body.token;
  const meA = await p.me(tokA), meB = await p.me(tokB);
  eq([meA.body.pppoe, meB.body.pppoe], ["andi@rw01", "budi@rw02"], "tiap token hanya melihat ONT-nya");
  ok(JSON.stringify(meA.body).indexOf("rahasia-lama") < 0, "sandi WiFi lama TIDAK ikut dikirim ke browser");
  eq(meA.body.ssids.map((s) => s.idx), ["1", "5"], "daftar SSID milik ONT sendiri");
  eq((await p.me("tokenpalsu")).status, 401, "token palsu ditolak"); eq((await p.me("")).status, 401, "tanpa token ditolak");

  console.log("T7 aksi: ganti SSID/sandi hanya ke ONT milik sesi, validasi ketat");
  tasks.length = 0;
  let r = await p.act("5.5.5.5", tokA, "ssid", "1", "Andi Baru"); eq(r.status, 200, "ganti nama WiFi berhasil");
  eq([tasks[0].id, tasks[0].body.name, tasks[0].body.parameterValues[0][0], tasks[0].body.parameterValues[0][1]], ["A-1", "setParameterValues", "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID", "Andi Baru"], "task ke ONT A, path & nilai tepat");
  r = await p.act("5.5.5.5", tokA, "pass", "5", "sandiBaru123"); eq(r.status, 200, "ganti sandi SSID 5 berhasil");
  eq(tasks[1].body.parameterValues[0][0], "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.PreSharedKey.1.KeyPassphrase", "path sandi benar");
  eq((await p.act("5.5.5.5", tokA, "ssid", "9", "x")).status, 400, "nomor SSID yang tidak ada ditolak");
  eq((await p.act("5.5.5.5", tokA, "ssid", "1.Enable", "x")).status, 400, "idx berisi path (injeksi) ditolak");
  eq((await p.act("5.5.5.5", tokA, "ssid", "1", 'a"b')).status, 400, "SSID bertanda kutip ditolak");
  eq((await p.act("5.5.5.5", tokA, "ssid", "1", "")).status, 400, "SSID kosong ditolak");
  eq((await p.act("5.5.5.5", tokA, "pass", "1", "pendek")).status, 400, "sandi < 8 karakter ditolak");
  eq((await p.act("5.5.5.5", tokA, "pass", "1", "a".repeat(64))).status, 400, "sandi > 63 karakter ditolak");
  eq((await p.act("5.5.5.5", tokA, "pass", "1", "sandi\nbaru123")).status, 400, "sandi berisi karakter kontrol ditolak");
  eq(tasks.length, 2, "aksi yang ditolak tidak mengirim task");
  eq((await p.act("5.5.5.5", "tokenpalsu", "reboot")).status, 401, "aksi tanpa sesi ditolak");
  tasks.length = 0; await p.act("5.5.5.6", tokB, "reboot"); eq([tasks.length, tasks[0] && tasks[0].id, tasks[0] && tasks[0].body.name], [1, "B-2", "reboot"], "reboot hanya ke ONT sesi B");

  console.log("T8 batas aksi harian dan batas laju");
  r = await p.act("5.5.5.5", tokA, "ssid", "1", "Lagi"); eq(r.status, 200, "aksi ke-3 hari ini masih boleh");
  r = await p.act("5.5.5.5", tokA, "ssid", "1", "Lagi2"); eq(r.status, 429, "aksi ke-4 melebihi batas harian (3) ditolak");
  sent = []; const p2 = mk(); let last;
  for (let i = 0; i < 11; i++) last = await p2.requestOtp("9.9.9.9", "08" + (3000000000 + i));
  eq(last.status, 429, "IP yang sama >10 permintaan OTP / 10 menit -> 429");
  const p3 = mk(); let vs = 0; for (let i = 0; i < 25; i++) vs = p3.verifyOtp("8.8.8.8", "081111111111", "123456").status;
  eq(vs, 429, "IP yang menebak >20 kali -> 429");
  sent = []; const p4 = mk(); await p4.requestOtp("7.7.7.1", "082222222222"); await p4.requestOtp("7.7.7.2", "082222222222"); eq(sent.length, 1, "kirim ulang < 60 detik tidak mengirim lagi");
  t += 61000; await p4.requestOtp("7.7.7.3", "082222222222"); eq(sent.length, 2, "kirim ulang setelah 60 detik boleh");
  t += 61000; await p4.requestOtp("7.7.7.4", "082222222222"); t += 61000; await p4.requestOtp("7.7.7.5", "082222222222"); eq(sent.length, 3, "maksimal 3 OTP per nomor / 10 menit");

  console.log("T9 sesi berakhir & logout; portal nonaktif");
  const p5 = mk(); sent = []; await p5.requestOtp("6.6.6.6", "081111111111"); const tk = p5.verifyOtp("6.6.6.6", "081111111111", code()).body.token;
  eq((await p5.me(tk)).status, 200, "sesi aktif"); p5.logout(tk); eq((await p5.me(tk)).status, 401, "logout mematikan token");
  await p5.requestOtp("6.6.6.7", "081111111111").catch(() => {}); t += 61000;
  sent = []; await p5.requestOtp("6.6.6.8", "081111111111"); const tk2 = p5.verifyOtp("6.6.6.8", "081111111111", code()).body.token; t += 31 * 60000;
  eq((await p5.me(tk2)).status, 401, "sesi kedaluwarsa setelah 30 menit");
  const off = mk({ settings: () => ({ enabled: false }) }); eq((await off.requestOtp("1.2.3.4", "081111111111")).status, 503, "portal nonaktif -> 503");

  console.log("T10 sandi tidak bocor ke log audit");
  const aud = fs.existsSync(AUDIT) ? fs.readFileSync(AUDIT, "utf8") : "";
  ok(aud.indexOf("sandiBaru123") < 0 && aud.indexOf("Andi Baru") < 0, "audit.log tidak memuat sandi/nilai baru");
  ok(/PORTAL login \*\*\*1111/.test(aud) && !/081111111111/.test(aud), "nomor di audit disamarkan (4 digit terakhir)");

  console.log("T11 lapisan HTTP");
  const portal = createPortal({ nbi: NBI, now: () => t, settings: () => ({ enabled: true, brand: "TesNet" }), send: async (ph, tx) => { sent.push({ p: ph, text: tx }); } });
  // startServer tidak diekspor; uji lewat modul dengan port acak
  const src = fs.readFileSync(path.join(BOT, "portal.js"), "utf8");
  ok(/Content-Security-Policy/.test(src) && /X-Frame-Options/.test(src) && /no-store/.test(src), "header keamanan (CSP, X-Frame-Options, no-store) ada");
  ok(/b\.length > 4096/.test(src), "batas ukuran body 4 KB ada");
  ok(!/innerHTML\s*=\s*[^;]*j\.(message)/.test(fs.readFileSync(path.join(BOT, "portal-page.html"), "utf8")), "halaman tidak memasukkan pesan server lewat innerHTML");

  console.log("T12 server HTTP sungguhan");
  const sent2 = [];
  const hp = createPortal({ nbi: NBI, now: Date.now, settings: () => ({ enabled: true, brand: "TesNet" }), send: async (ph, tx) => { sent2.push({ p: ph, text: tx }); } });
  const srv = startServer(hp, 0, { trustProxy: false }); await new Promise((r) => srv.on("listening", r));
  const B = "http://127.0.0.1:" + srv.address().port;
  const post = (u, body, h) => fetch(B + u, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, h || {}), body: typeof body === "string" ? body : JSON.stringify(body) });
  let rs = await fetch(B + "/"); eq(rs.status, 200, "GET / menyajikan halaman");
  ok(/default-src 'none'/.test(rs.headers.get("content-security-policy") || "") && rs.headers.get("x-frame-options") === "DENY" && rs.headers.get("cache-control") === "no-store", "header CSP, X-Frame-Options, no-store terkirim");
  eq((await fetch(B + "/admin")).status, 404, "path lain 404"); eq((await fetch(B + "/api/otp/request")).status, 404, "GET ke endpoint POST -> 404");
  eq((await post("/api/otp/request", "{bukan json")).status, 400, "JSON rusak -> 400");
  eq((await fetch(B + "/api/me")).status, 401, "/api/me tanpa token -> 401");
  let dropped = false; try { const big = await post("/api/otp/request", JSON.stringify({ phone: "0".repeat(10000) })); dropped = big.status >= 400; } catch (e) { dropped = true; }
  ok(dropped, "body > 4 KB ditolak/diputus");
  rs = await post("/api/otp/request", { phone: "081111111111" }); eq(rs.status, 200, "minta OTP lewat HTTP"); eq(sent2.length, 1, "OTP terkirim lewat HTTP");
  const c12 = sent2[0].text.match(/\*(\d{6})\*/)[1];
  rs = await post("/api/otp/verify", { phone: "081111111111", code: c12 }); const tk12 = (await rs.json()).token; ok(!!tk12, "verifikasi HTTP -> token");
  rs = await fetch(B + "/api/me", { headers: { "X-Portal-Token": tk12 } }); const me12 = await rs.json(); eq([rs.status, me12.pppoe], [200, "andi@rw01"], "/api/me lewat HTTP");
  rs = await post("/api/wifi/ssid", { idx: "1", value: "Via HTTP", deviceId: "B-2", _id: "B-2" }, { "X-Portal-Token": tk12 }); eq(rs.status, 200, "ganti SSID lewat HTTP");
  eq(tasks[tasks.length - 1].id, "A-1", "ID ONT dari body (deviceId/_id) diabaikan; tetap ONT milik sesi");
  let st = 0; for (let i = 0; i < 12; i++) st = (await post("/api/otp/request", { phone: "0899000000" + i }, { "X-Forwarded-For": "10.0." + i + ".1", "CF-Connecting-IP": "9.9.9." + i })).status;
  eq(st, 429, "memalsukan X-Forwarded-For/CF-Connecting-IP tidak melewati batas laju (trustProxy mati)");
  srv.close();

  nbi.close();
  if (!hadAudit) try { fs.unlinkSync(AUDIT); } catch (e) { /* abaikan */ }
  console.log("\nHASIL: PASS=" + pass + " FAIL=" + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log("ERROR", e); process.exit(2); });
