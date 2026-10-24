// Nokia / Alcatel-Lucent (ALCL): buat WAN PPPoE
// args: [vlan, username, password]   contoh: 30, "user@pppoe", "rahasia"
//
// Nokia wajib 1 WAN per WANConnectionDevice (WCD), VLAN ada di
// X_CT-COM_WANGponLinkConfig.VLANIDMark, dan WCD baru dibuat dengan Mode=0
// (untagged) sehingga VLAN baru bisa diset setelah Mode=2. Karena urutan ini,
// WCD dicari manual (bukan alias) dan tiap langkah di-commit terpisah.
// Aman dijalankan berulang: WAN dengan VLAN yang sama tidak dibuat ulang.
const now = Date.now();
const hourly = now - 3590000;
const vlan = parseInt(args[0], 10);
const user = String(args[1] || "");
const pass = String(args[2] || "");
const base = "InternetGatewayDevice.WANDevice.1.WANConnectionDevice";
const merk = declare("DeviceID.Manufacturer", {value: 1}).value[0];

if (merk !== "ALCL") {
  log("nokia_pppoe: skip, bukan Nokia (" + merk + ")");
}
else if (!(vlan > 0 && vlan < 4095) || !user) {
  log("nokia_pppoe: args tidak valid, butuh [vlan, username, password]");
}
else {
  let idx = findWcd();

  // 1. Buat WCD baru kalau belum ada WCD untuk VLAN ini (atau WCD kosong sisa percobaan sebelumnya)
  if (!idx) {
    let all = declare(base + ".*", {path: hourly});
    declare(base + ".*", {path: hourly}, {path: all.size + 1});
    commit();
    idx = findWcd();
  }

  if (!idx) {
    log("nokia_pppoe: gagal membuat WANConnectionDevice");
  }
  else {
    const wcd = base + "." + idx;
    const link = wcd + ".X_CT-COM_WANGponLinkConfig";

    // 2. Mode tagged dulu, baru VLAN
    declare(link + ".Enable", {value: hourly}, {value: true});
    declare(link + ".Mode", {value: hourly}, {value: 2});
    commit();
    declare(link + ".VLANIDMark", {value: hourly}, {value: vlan});
    commit();

    // 3. Tepat 1 WANPPPConnection di WCD tsb
    const ppp = wcd + ".WANPPPConnection.*";
    declare(ppp, {path: hourly}, {path: 1});

    // 4. Parameter PPPoE
    declare(ppp + ".Enable", {value: hourly}, {value: true});
    declare(ppp + ".ConnectionType", {value: hourly}, {value: "IP_Routed"});
    declare(ppp + ".NATEnabled", {value: hourly}, {value: true});
    declare(ppp + ".X_D0542D_ServiceList", {value: hourly}, {value: "INTERNET"});
    declare(ppp + ".Username", {value: hourly}, {value: user});
    // Password tidak bisa dibaca dari Nokia (selalu kosong), jadi bandingkan
    // dengan nilai terakhir yang tersimpan di GenieACS saja (tanpa GPV)
    if (pass) declare(ppp + ".Password", null, {value: pass});

    log("nokia_pppoe: WCD." + idx + " VLAN " + vlan + " user " + user);
  }
}

// Cari index WCD dengan VLAN ini; kalau tidak ada, pakai WCD kosong
// (VLAN 0, tanpa koneksi) yang mungkin tersisa dari percobaan sebelumnya.
function findWcd() {
  let vl = declare(base + ".*.X_CT-COM_WANGponLinkConfig.VLANIDMark", {path: hourly, value: hourly});
  let empty = null;

  for (let p of vl) {
    let i = p.path.split(".")[4];
    if (p.value && p.value[0] == vlan) return i;

    if (!empty && p.value && p.value[0] == 0) {
      let nPpp = declare(base + "." + i + ".WANPPPConnectionNumberOfEntries", {value: hourly});
      let nIp = declare(base + "." + i + ".WANIPConnectionNumberOfEntries", {value: hourly});
      if (nPpp.value && nPpp.value[0] == 0 && nIp.value && nIp.value[0] == 0) empty = i;
    }
  }

  return empty;
}
