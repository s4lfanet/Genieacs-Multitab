// ALIJAYA-NET SSID aktif
// Daftar SSID yang Enable beserta jumlah client, contoh: "Mozi (3) | Mozi_5G (1)".
// Jumlah & index SSID beda tiap merk (Huawei 1/5, FiberHome HG6045F3 1/9, ZTE 1-4, dst),
// jadi semua WLANConfiguration dibaca lalu disaring berdasarkan Enable.
const hourly = Date.now() - 3590000;
const minutes = Date.now() - 120 * 1000;

// Enable bisa true / "TRUE" (ZTE) / "1" / 1
let isOn = (v) => v === true || v === 1 || /^(true|1)$/i.test(String(v));

let list = [];
let en = declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.*.Enable", {path: hourly, value: hourly});

for (let e of en) {
  if (!e.value || !isOn(e.value[0])) continue;

  let w = e.path.slice(0, -".Enable".length);
  let idx = parseInt(w.split(".").pop(), 10);
  let ssid = declare(w + ".SSID", {value: hourly});
  let total = declare(w + ".TotalAssociations", {value: minutes});

  let name = ssid.size && ssid.value ? ssid.value[0] : "";
  if (!name) continue;
  let n = total.size && total.value ? parseInt(total.value[0], 10) || 0 : 0;

  list.push({idx: idx, text: name + " (" + n + ")"});
}

list.sort((a, b) => a.idx - b.idx);

return {writable: false, value: [list.map((x) => x.text).join(" | "), "xsd:string"]};
