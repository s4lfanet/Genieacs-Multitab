// ALIJAYA-NET Total active all ssid
// Jumlahkan TotalAssociations semua SSID yang Enable (index berapa pun,
// mis. FiberHome HG6045F3 5GHz di index 9).
const hourly = Date.now() - 3590000;

let active = 0;
let isOn = (v) => v === true || v === 1 || /^(true|1)$/i.test(String(v));

let en = declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.*.Enable", {path: hourly, value: hourly});

for (let e of en) {
  if (!e.value || !isOn(e.value[0])) continue;

  let w = e.path.slice(0, -".Enable".length);
  let total = declare(w + ".TotalAssociations", {value: Date.now()});
  if (total.size && total.value) {
    let n = parseInt(total.value[0], 10);
    if (isFinite(n)) active += n;
  }
}

return {writable: false, value: active};
