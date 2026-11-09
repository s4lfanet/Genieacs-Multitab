// SALFA NET TXPower: daya optik pancar ONT (TX), dalam dBm, lintas merek.
// Dibaca oleh aplikasi Android (SentraACS, Genieacs.apk). Pasangan dari VP RXPower dengan jalur yang sama untuk TX.
// Keluaran angka dua desimal sebagai string ("2.46") atau "N/A", sama seperti RXPower; satuan ditampilkan di UI.
//
// Satuan berbeda per merek: sebagian sudah dBm ("2.66", "2.086048  dBm"), sebagian satuan 0,1 µW (mis. 17619 = 2,46 dBm).
// Nilai dengan |x| > 100 dianggap satuan 0,1 µW dan diubah ke dBm; lainnya dianggap sudah dBm.
// Nilai di luar -20..+20 dBm atau tepat 0 dianggap tidak valid (ONT sering mengisi 0 bila tidak didukung).
let m = "N/A";

const paths = [
  "InternetGatewayDevice.DeviceInfo.XponInterface.TXPower",                                      // C-Data
  "InternetGatewayDevice.WANDevice.*.X_ZTE-COM_WANPONInterfaceConfig.TXPower",                   // ZTE F670L / F679D
  "InternetGatewayDevice.WANDevice.*.X_GponInterafceConfig.TXPower",                             // Huawei (ejaan vendor "Interafce")
  "InternetGatewayDevice.WANDevice.*.X_FH_GponInterfaceConfig.TXPower",                          // FiberHome
  "InternetGatewayDevice.X_ALU_OntOpticalParam.TXPower",                                         // Nokia / Alcatel-Lucent
  "InternetGatewayDevice.WANDevice.*.X_CMCC_GponInterfaceConfig.TXPower",                        // ZTE CMCC (GPON)
  "InternetGatewayDevice.WANDevice.*.X_CMCC_EponInterfaceConfig.TXPower",                        // ZTE F663 (EPON)
  "InternetGatewayDevice.WANDevice.*.X_CT-COM_GponInterfaceConfig.TXPower",                      // CT-COM (GPON)
  "InternetGatewayDevice.WANDevice.*.X_CT-COM_EponInterfaceConfig.TXPower",                      // CT-COM (EPON), ZICG, GM220
  "InternetGatewayDevice.WANDevice.*.X_CU_WANEPONInterfaceConfig.OpticalTransceiver.TXPower"     // F477 / F677
];

function toDbm(v) {
  if (v === undefined || v === null || v === "") return null;
  let n = parseFloat(String(v).replace(/[^0-9.+\-eE]/g, ""));
  if (isNaN(n) || n === 0) return null;
  if (Math.abs(n) > 100) n = 30 + Math.log10(Math.abs(n) * Math.pow(10, -7)) * 10;
  if (n < -20 || n > 20) return null;
  return Math.round(n * 100) / 100;
}

for (let i = 0; i < paths.length && m === "N/A"; i++) {
  const d = declare(paths[i], {value: Date.now()});
  if (!d.size) continue;
  for (let p of d) {
    const raw = Array.isArray(p.value[0]) ? p.value[0][0] : p.value[0];
    const dbm = toDbm(raw);
    if (dbm !== null) { m = dbm; break; }
  }
}

return {
  writable: false,
  value: [m === "N/A" ? "N/A" : m.toFixed(2), "xsd:string"]
};
