// Provision connreq -- HANYA menyetel kredensial connection request ONT supaya ACS bisa melakukan Summon/refresh.
//
// Kenapa perlu: ONT umumnya TIDAK membocorkan password connection request saat dibaca (selalu kosong), jadi ACS hanya
// tahu password itu kalau ACS sendiri yang menyetelnya. Di GenieACS baru (belum ada provision yang menyetelnya), tombol
// Summon dan refresh gagal dengan "Connection request error: Incorrect connection request credentials".
//
// Aman dibanding inform2: provision ini TIDAK mengubah URL ACS, user/password ACS, atau interval inform. Rumus user/
// password SAMA dengan inform2.js, jadi memasangnya di server yang sudah memakai inform2 tidak mengubah nilai apa pun.
// Nilai deterministik dari ID device (bukan acak) supaya tidak memicu too_many_commits.
const daily = Date.now() - 86400000;

const deviceId = declare("DeviceID.ID", {value: 1}).value[0];
const cleaned = String(deviceId).replace(/[^a-zA-Z0-9]/g, "");
const ConnReqUser = cleaned.slice(-16);
const ConnReqPass = "Cs" + cleaned.padEnd(24, "X").slice(4, 14) + "@4";

const brand = declare("DeviceID.Manufacturer", {value: 1}).value[0];
const root = brand !== "MikroTik" ? "InternetGatewayDevice" : "Device";

declare(root + ".ManagementServer.ConnectionRequestUsername", {value: daily}, {value: ConnReqUser});
declare(root + ".ManagementServer.ConnectionRequestPassword", {value: daily}, {value: ConnReqPass});
