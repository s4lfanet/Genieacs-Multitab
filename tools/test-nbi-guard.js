#!/usr/bin/env node
// Uji validasi & parser penjaga NBI (scripts/nbi-guard.js): node tools/test-nbi-guard.js. Tanpa root/iptables/MongoDB.
"use strict";
const path = require("path");
const { ip4, validate, sig, parseBlocked, netOf, RESERVED, shouldPublish, BLOCKED_EVERY } = require(path.join(__dirname, "..", "scripts", "nbi-guard.js"));
let pass = 0, fail = 0;
const eq = (a, b, n) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : fail++; console.log((ok ? "  PASS  " : "  FAIL  ") + n + (ok ? "" : " (dapat " + JSON.stringify(a) + ", mau " + JSON.stringify(b) + ")")); };

console.log("T1 ip4: hanya IPv4 valid; blok terlalu lebar ditolak");
eq(ip4("114.122.75.181"), "114.122.75.181/32", "IP tunggal -> /32");
eq(ip4("10.8.0.0/24"), "10.8.0.0/24", "CIDR /24");
eq(ip4(" 192.168.54.5/32 "), "192.168.54.5/32", "spasi di tepi dipangkas");
eq(ip4("10.0.0.0/16"), "10.0.0.0/16", "/16 diizinkan");
eq([ip4("10.0.0.0/15"), ip4("0.0.0.0/0"), ip4("10.0.0.0/8"), ip4("1.2.3.4/0")], [null, null, null, null], "blok < /16 (termasuk 0.0.0.0/0) DITOLAK");
eq([ip4("256.1.1.1"), ip4("1.2.3"), ip4("1.2.3.4.5"), ip4("a.b.c.d"), ip4(""), ip4("1.2.3.4/33")], [null, null, null, null, null, null], "format/octet/prefix salah");
eq([ip4("010.1.1.1"), ip4("1.02.3.4")], [null, null], "angka berawalan nol (ambigu/oktal) ditolak");
eq([ip4("1.2.3.4; reboot"), ip4("1.2.3.4 -j ACCEPT"), ip4("$(id)"), ip4("1.2.3.4\n5.6.7.8"), ip4("1.2.3.4/24 ")], [null, null, null, null, "1.2.3.4/24"], "injeksi perintah/opsi iptables ditolak");
eq(ip4("0.1.2.3"), null, "0.x.x.x ditolak");
eq(ip4("::1"), null, "IPv6 belum didukung -> ditolak");

console.log("T2 validate: port");
eq(validate({ enabled: true, port: 7557, allow: [] }).ok, true, "7557 valid");
eq(validate({ enabled: true, allow: [] }).clean.port, 7557, "port kosong -> bawaan 7557");
[22, 3000, 7547, 7567, 3020, 3010, 27017, 80, 443].forEach((p) => eq(validate({ enabled: true, port: p, allow: [] }).ok, false, "port " + p + " (" + RESERVED[p] + ") DITOLAK (bisa memutus ONT/UI/SSH)"));
eq([validate({ port: 0 }).ok, validate({ port: 70000 }).ok, validate({ port: "abc" }).ok, validate({ port: 75.5 }).ok, validate({ port: -1 }).ok], [false, false, false, false, false], "port di luar 1-65535 / bukan bilangan bulat ditolak");
eq(validate({ enabled: true, port: "7557", allow: [] }).clean.port, 7557, "port string angka diterima");
eq(validate({ enabled: true, port: 8123, allow: [] }).ok, true, "port kustom valid");

console.log("T3 validate: daftar izin");
let v = validate({ enabled: true, port: 7557, allow: [{ c: "114.122.75.181", n: "HP admin" }, { c: "114.122.75.181/32" }, "10.8.0.0/24"] });
eq(v.clean.allow.map((x) => x.c), ["114.122.75.181/32", "10.8.0.0/24"], "duplikat dibuang, string biasa diterima");
eq(v.clean.allow[0].n, "HP admin", "keterangan dipertahankan");
v = validate({ enabled: true, port: 7557, allow: [{ c: "1.2.3.4" }, { c: "bukan-ip" }, { c: "0.0.0.0/0" }] });
eq([v.ok, v.errors.length], [false, 2], "satu entri baik + dua buruk -> ditolak seluruhnya, 2 pesan error");
eq(validate({ enabled: true, port: 7557, allow: new Array(51).fill("1.2.3.4") }).ok, false, "lebih dari 50 entri ditolak");
eq(/[<>`$"';\\]/.test(validate({ enabled: true, port: 7557, allow: [{ c: "1.2.3.4", n: "a<script>`$(x)`\"';\\" }] }).clean.allow[0].n), false, "keterangan dibersihkan dari < > ` $ \" ' ; \ (hanya ditampilkan, tidak pernah ke shell)");
eq(validate(null).ok, false, "null ditolak"); eq(validate("x").ok, false, "string ditolak"); eq(validate({ allow: "1.2.3.4" }).clean.allow, [], "allow bukan array -> kosong");
eq([validate({ enabled: "true" }).clean.enabled, validate({ enabled: "false" }).clean.enabled, validate({}).clean.enabled, validate({ enabled: 1 }).clean.enabled], [true, false, false, false], "enabled hanya true/'true'");

console.log("T4 sig: perubahan nyata saja yang memicu penerapan");
const a = validate({ enabled: true, port: 7557, allow: ["1.2.3.4", "5.6.7.8"], rev: 1 }).clean, b = validate({ enabled: true, port: 7557, allow: ["5.6.7.8", "1.2.3.4"], rev: 2 }).clean;
eq(sig(a) === sig(b), true, "urutan/rev/keterangan berbeda -> signature sama (tidak menerapkan ulang)");
eq(sig(a) === sig(validate({ enabled: true, port: 7557, allow: ["1.2.3.4"] }).clean), false, "daftar berbeda -> signature beda");
eq(sig(a) === sig(validate({ enabled: false, port: 7557, allow: ["1.2.3.4", "5.6.7.8"] }).clean), false, "enabled berbeda -> signature beda");
eq(sig(a) === sig(validate({ enabled: true, port: 7600, allow: ["1.2.3.4", "5.6.7.8"] }).clean), false, "port berbeda -> signature beda");

console.log("T5 parseBlocked");
const log = [
  "1762253000.123 salfanet kernel: gm-nbi-blok-7557: IN=ens18 OUT= MAC=aa SRC=114.122.75.181 DST=192.168.54.254 LEN=60 PROTO=TCP SPT=51138 DPT=7557",
  "1762253010.500 salfanet kernel: gm-nbi-blok-7557: IN=ens18 OUT= SRC=114.122.75.181 DST=192.168.54.254 PROTO=TCP SPT=1 DPT=7557",
  "1762253020 salfanet kernel: gm-nbi-blok-7557: IN=ens18 OUT= SRC=45.9.8.7 DST=192.168.54.254 PROTO=TCP SPT=2 DPT=7557",
  "1762253030 salfanet kernel: gm-nbi-blok-7599: IN=ens18 OUT= SRC=9.9.9.9 DST=192.168.54.254 PROTO=TCP SPT=3 DPT=7599",
  "1762253040 salfanet sshd[1]: Failed password for root from 6.6.6.6",
  "baris rusak gm-nbi-blok-7557: tanpa src"
].join("\n");
const bl = parseBlocked(log, 7557);
eq(bl.map((x) => x.ip + ":" + x.count), ["114.122.75.181:2", "45.9.8.7:1"], "dikelompokkan per SRC, terbanyak dulu, hanya port 7557");
eq(bl[0].last, 1762253010000, "waktu terakhir (ms, dibulatkan ke detik)");
eq(parseBlocked(log, 7599).map((x) => x.ip), ["9.9.9.9"], "port lain terpisah"); eq(parseBlocked("", 7557), [], "kosong");

console.log("T6 netOf: bandingkan subnet server sendiri");
eq([netOf("192.168.54.254/24"), netOf("10.8.0.3/24"), netOf("1.2.3.4/32"), netOf("172.16.5.9/16")], ["192.168.54.0/24", "10.8.0.0/24", "1.2.3.4/32", "172.16.0.0/16"], "alamat host -> alamat jaringan");

console.log("T7 shouldPublish: Config hanya ditulis bila status berubah (cegah banner 'please reload' terus-menerus)");
const T0 = 1000000000000, E = BLOCKED_EVERY;
eq(shouldPublish("A", "b1", T0, { core: null, blocked: null, at: 0 }), true, "pertama kali: tulis");
eq(shouldPublish("A", "b1", T0 + 20000, { core: "A", blocked: "b1", at: T0 }), false, "tidak berubah: tidak ditulis (dulu ditulis tiap 20 dtk)");
eq(shouldPublish("A", "b1", T0 + 7 * 86400000, { core: "A", blocked: "b1", at: T0 }), false, "tidak berubah lama sekali: tetap tidak ditulis");
eq(shouldPublish("B", "b1", T0 + 1000, { core: "A", blocked: "b1", at: T0 }), true, "status inti berubah: langsung ditulis");
eq(shouldPublish("A", "b2", T0 + 60000, { core: "A", blocked: "b1", at: T0 }), false, "hanya daftar ditolak berubah, < 10 mnt: ditahan");
eq(shouldPublish("A", "b2", T0 + E, { core: "A", blocked: "b1", at: T0 }), true, "hanya daftar ditolak berubah, >= 10 mnt: ditulis");

console.log("\nHASIL: PASS=" + pass + " FAIL=" + fail);
process.exit(fail ? 1 : 0);
