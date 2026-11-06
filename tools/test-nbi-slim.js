#!/usr/bin/env node
// Uji gerbang NBI untuk aplikasi Android (scripts/nbi-slim.js): node tools/test-nbi-slim.js. NBI & UI tiruan di localhost.
"use strict";
const http = require("http"), zlib = require("zlib"), path = require("path");
const slim = require(path.join(__dirname, "..", "scripts", "nbi-slim.js"));
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? "  PASS  " : "  FAIL  ") + n); };
const eq = (a, b, n) => ok(JSON.stringify(a) === JSON.stringify(b), n + (JSON.stringify(a) === JSON.stringify(b) ? "" : " (dapat " + JSON.stringify(a) + ", mau " + JSON.stringify(b) + ")"));

console.log("T1 judge: jalur dan task yang diizinkan");
const J = slim.judge;
eq([J("GET", "/devices?limit=1"), J("GET", "/devices/?query=%7B%7D"), J("GET", "/faults?x=1")], [null, null, null], "GET /devices dan /faults boleh");
eq([!!J("GET", "/users"), !!J("GET", "/presets"), !!J("GET", "/files"), !!J("GET", "/provisions"), !!J("GET", "/virtual-parameters"), !!J("GET", "/devices/../users")], [true, true, true, true, true, true], "GET /users, /presets, /files, /provisions, /virtual-parameters, path traversal DIBLOK");
eq([!!J("DELETE", "/devices/abc"), !!J("PUT", "/devices/abc"), !!J("POST", "/devices"), !!J("POST", "/presets/x")], [true, true, true, true], "DELETE device, PUT, POST selain tasks/tags DIBLOK");
const T = (o, id) => J("POST", "/devices/" + (id || "ZTE-1") + "/tasks?connection_request", JSON.stringify(o));
eq([T({ name: "reboot" }), T({ name: "refreshObject", objectName: "" }), T({ name: "refreshObject" })], [null, null, null], "reboot boleh; refreshObject objectName kosong boleh (itu yang dikirim tombol Summon aplikasi)");
eq([!!T({ name: "refreshObject", objectName: "Bukan.Path" }), !!T({ name: "addObject", objectName: "" }), !!T({ name: "deleteObject" })], [true, true, true], "refreshObject jalur aneh, addObject/deleteObject tanpa jalur DIBLOK");
eq(T({ name: "refreshObject", objectName: "InternetGatewayDevice" }), null, "refreshObject InternetGatewayDevice boleh");
eq(T({ name: "setParameterValues", parameterValues: [["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID", "x", "xsd:string"]] }), null, "setParameterValues boleh");
eq(T({ name: "addObject", objectName: "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection." }), null, "addObject (tambah WAN) boleh");
eq(T({ name: "deleteObject", objectName: "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2." }), null, "deleteObject boleh");
eq(["factoryReset", "download", "uploadFile", "x"].map((n) => !!T({ name: n })), [true, true, true, true], "factoryReset, download, uploadFile, task asing DIBLOK");
eq([!!T({ name: "setParameterValues", parameterValues: [["; rm -rf", "x"]] }), !!T({ name: "setParameterValues", parameterValues: "x" }), !!T({ name: "addObject", objectName: "Bukan.Path" })], [true, true, true], "parameter/objek di luar InternetGatewayDevice|Device|VirtualParameters DIBLOK");
eq([!!J("POST", "/devices/a%2Fb%00/tasks", '{"name":"reboot"}'), !!J("POST", "/devices/x/tasks", "bukan json")], [true, true], "id aneh / badan bukan JSON ditolak");
eq([J("POST", "/devices/ZTE-1/tags/LOC_-6330000_108320000"), J("DELETE", "/devices/ZTE-1/tags/ODP_ODP-01")], [null, null], "tag LOC_/ODP_ (tulis & hapus) boleh");
eq(!!J("POST", "/devices/ZTE-1/tags/a b;c"), true, "tag dengan karakter aneh ditolak");

console.log("T2 strip: metadata dibuang, data aplikasi tetap");
const orig = [{ _id: "A", _lastInform: "2026-11-06T00:00:00Z", _tags: ["t"], _deviceId: { _ProductClass: "F670L" }, VirtualParameters: { _object: true, _timestamp: "x", _writable: true, RXPower: { _value: "-17.2", _type: "xsd:string", _timestamp: "x", _writable: false } }, InternetGatewayDevice: { _object: true, X: { Y: { _value: 5, _type: "xsd:int", _writable: true, _instance: true } } } }];
const s = slim.strip(JSON.parse(JSON.stringify(orig)));
eq(s[0].VirtualParameters.RXPower, { _value: "-17.2" }, "_value tetap; _type/_timestamp/_writable hilang");
eq([s[0]._id, s[0]._lastInform, s[0]._tags, s[0]._deviceId], [orig[0]._id, orig[0]._lastInform, orig[0]._tags, orig[0]._deviceId], "_id, _lastInform, _tags, _deviceId utuh");
eq(s[0].InternetGatewayDevice.X.Y, { _value: 5, _instance: true }, "_instance dipertahankan");
eq(JSON.stringify(s).indexOf("_timestamp") < 0 && JSON.stringify(s).indexOf("_writable") < 0 && JSON.stringify(s).indexOf("_object") < 0, true, "tidak ada sisa metadata");
eq(slim.strip("teks"), "teks", "nilai bukan objek tidak diubah");

console.log("T3 parseBasic");
eq(slim.parseBasic("Basic " + Buffer.from("admin:p:ss").toString("base64")), { user: "admin", pass: "p:ss" }, "sandi boleh berisi ':'");
eq([slim.parseBasic(""), slim.parseBasic("Bearer x"), slim.parseBasic("Basic !!!"), slim.parseBasic("Basic " + Buffer.from("tanpa-titik-dua").toString("base64"))], [null, null, null, null], "header salah -> null");

(async () => {
  // NBI & UI tiruan
  const calls = { list: 0, tasks: [], other: [], login: 0 }; let uiDown = false;
  const mkList = () => { const a = []; for (let i = 0; i < 300; i++) { const w = {}; for (let k = 0; k < 40; k++) w["P" + k] = { _value: "v" + k, _type: "xsd:string", _timestamp: "2026-11-06T13:20:11.123Z", _writable: true }; a.push({ _id: "ZTE-" + i, _lastInform: "2026-11-06T00:00:00Z", _tags: [], _deviceId: { _ProductClass: "F670L" }, InternetGatewayDevice: { _object: true, _timestamp: "x", _writable: true, W: w } }); } return a; };
  const LIST = mkList(), LIST_BYTES = JSON.stringify(LIST).length;
  const nbi = http.createServer((q, r) => { let b = ""; q.on("data", (c) => b += c); q.on("end", () => {
    const u = new URL(q.url, "http://x"), js = (o, c) => { r.statusCode = c || 200; r.setHeader("content-type", "application/json"); r.end(JSON.stringify(o)); };
    if (u.pathname === "/devices" || u.pathname === "/devices/") { if (u.searchParams.get("limit") === "1") return js([{ _id: "ZTE-0" }]); calls.list++; return js(LIST); }
    if (/\/tasks/.test(u.pathname)) { calls.tasks.push(JSON.parse(b || "{}").name + " auth=" + (q.headers.authorization ? "BOCOR" : "tidak")); return js({ _id: "t1" }); }
    calls.other.push(q.method + " " + u.pathname); if (u.pathname === "/users") return js([{ _id: "admin", salt: "s", password: "HASH-RAHASIA" }]); js({}, 404); }); }).listen(0, "127.0.0.1");
  const ui = http.createServer((q, r) => { let b = ""; q.on("data", (c) => b += c); q.on("end", () => { calls.login++; if (uiDown) { r.statusCode = 500; return r.end(); } const p = new URLSearchParams(b); r.statusCode = p.get("username") === "admin" && p.get("password") === "rahasia" ? 200 : 401; r.end("x"); }); }).listen(0, "127.0.0.1");
  await Promise.all([new Promise((r) => nbi.on("listening", r)), new Promise((r) => ui.on("listening", r))]);
  slim.C.upstream = "http://127.0.0.1:" + nbi.address().port; slim.C.ui = "http://127.0.0.1:" + ui.address().port; slim.C.cacheSeconds = 15;
  const srv = slim.start(0, "127.0.0.1"); await new Promise((r) => srv.on("listening", r));
  const B = "http://127.0.0.1:" + srv.address().port, GOOD = "Basic " + Buffer.from("admin:rahasia").toString("base64");
  const get = (p, h) => fetch(B + p, { headers: h || {} });
  const rawGet = (p, h) => new Promise((res, rej) => { http.get(B + p, { headers: h }, (x) => { const c = []; x.on("data", (d) => c.push(d)); x.on("end", () => res(Buffer.concat(c))); }).on("error", rej); });

  console.log("T4 autentikasi");
  let r = await get("/devices?limit=1"); eq([r.status, r.headers.get("www-authenticate")], [401, 'Basic realm="GenieACS NBI"'], "tanpa login -> 401 + WWW-Authenticate");
  r = await get("/devices?limit=1", { Authorization: "Basic " + Buffer.from("admin:salah").toString("base64") }); eq(r.status, 401, "sandi salah -> 401");
  r = await get("/devices?limit=1", { Authorization: GOOD }); eq(r.status, 200, "akun UI benar -> 200");
  const lg = calls.login; await get("/devices?limit=1", { Authorization: GOOD }); eq(calls.login, lg, "login yang benar di-cache (UI tidak ditanya lagi)");
  r = await get("/users", { Authorization: GOOD }); eq([r.status, calls.other.indexOf("GET /users") < 0], [403, true], "/users DIBLOK dan tidak pernah sampai ke NBI (hash tidak bocor)");
  r = await get("/presets", { Authorization: GOOD }); eq(r.status, 403, "/presets 403");
  r = await fetch(B + "/devices/ZTE-1", { method: "DELETE", headers: { Authorization: GOOD } }); eq(r.status, 403, "DELETE device 403");

  console.log("T5 daftar ONT: kecil, gzip, cache");
  r = await get("/devices?projection=_id%2CVirtualParameters", { Authorization: GOOD, "Accept-Encoding": "gzip" });
  const gz = await rawGet("/devices?projection=_id%2CVirtualParameters", { Authorization: GOOD, "Accept-Encoding": "gzip" });   // fetch() membuka gzip sendiri; ambil byte mentah
  eq([r.status, r.headers.get("content-encoding")], [200, "gzip"], "gzip dipakai bila diminta");
  const dec = JSON.parse(zlib.gunzipSync(gz).toString());
  eq([dec.length, dec[0]._id, dec[0].InternetGatewayDevice.W.P7], [300, "ZTE-0", { _value: "v7" }], "isi benar, hanya _value tersisa");
  ok(!/_timestamp|_writable|_object|_type/.test(JSON.stringify(dec)), "tidak ada metadata di jawaban");
  console.log("        (info) NBI " + (LIST_BYTES / 1e6).toFixed(2) + " MB -> jaringan " + (gz.length / 1e3).toFixed(0) + " KB (" + (gz.length / LIST_BYTES * 100).toFixed(1) + "%)");
  ok(gz.length < LIST_BYTES * 0.03, "ukuran di jaringan < 3% dari NBI");
  const plainRaw = await rawGet("/devices?projection=_id%2CVirtualParameters", { Authorization: GOOD }); const plain = JSON.parse(plainRaw.toString("utf8"));
  eq([plain.length, /_timestamp|_writable/.test(plainRaw.toString("utf8"))], [300, false], "tanpa Accept-Encoding: JSON biasa (tetap tanpa metadata)");
  eq(calls.list, 1, "dua permintaan identik berturut-turut -> NBI hanya ditanya 1x (cache)");
  const before = calls.list; await Promise.all([1, 2, 3, 4].map(() => get("/devices?projection=_id%2Cx", { Authorization: GOOD }))); eq(calls.list - before, 1, "4 permintaan bersamaan yang identik -> NBI 1x");
  const nocache = await get("/devices?limit=1", { Authorization: GOOD }); eq((await nocache.json())[0]._id, "ZTE-0", "jawaban kecil (limit=1) tetap benar");

  console.log("T6 task diteruskan, kredensial tidak bocor ke NBI");
  const post = (p, o) => fetch(B + p, { method: "POST", headers: { Authorization: GOOD, "Content-Type": "application/json" }, body: JSON.stringify(o) });
  r = await post("/devices/ZTE-1/tasks?connection_request", { name: "reboot" }); eq(r.status, 200, "reboot diteruskan");
  r = await post("/devices/ZTE-1/tasks", { name: "factoryReset" }); eq(r.status, 403, "factoryReset 403");
  r = await post("/devices/ZTE-1/tasks", { name: "download", file: "x" }); eq(r.status, 403, "download 403");
  eq(calls.tasks, ["reboot auth=tidak"], "hanya reboot yang sampai ke NBI, tanpa header Authorization");
  r = await fetch(B + "/devices/ZTE-1/tasks", { method: "POST", headers: { Authorization: GOOD }, body: "x".repeat(70000) }).then((x) => x.status, () => "diputus"); ok(r === "diputus" || r >= 400, "badan > 64 KB ditolak/diputus");

  console.log("T7 pembatasan percobaan login & UI mati");
  let st = 0; for (let i = 0; i < 12; i++) st = (await get("/devices?limit=1", { Authorization: "Basic " + Buffer.from("admin:tebak" + i).toString("base64") })).status;
  eq(st, 429, "10+ gagal login dari satu IP -> 429");
  r = await get("/devices?limit=1", { Authorization: GOOD }); eq(r.status, 200, "akun yang sudah ter-cache tetap lolos saat IP dibatasi (tidak mengunci pengguna sah)");

  srv.close(); nbi.close(); ui.close();
  console.log("\nHASIL: PASS=" + pass + " FAIL=" + fail); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log("ERROR", e); process.exit(2); });
