// SALFA NET RXPower: daya optik terima ONT (RX) dalam dBm, lintas merek.
// Format keluaran mengikuti alijayanet/genieacs-multitab-mod: angka dua desimal sebagai string ("-14.00"),
// atau "N/A" bila tidak ada data. Aplikasi Android (SentraACS, Genieacs.apk) mem-parse nilai ini sebagai angka,
// jadi jangan tambahkan satuan/teks status ("dBm", "(Bagus)") di sini; tampilkan satuan di UI.
//
// Satuan mentah berbeda per merek:
//   - sudah dBm: Huawei (-14), FiberHome ("-20.41"), ZTE F6xx ("-16.99"), C-Data/CDTC ("-10.700704  dBm")
//   - 0,1 µW: ZTE/ZICG EPON CMCC/CT-COM (676 = -11.70 dBm), CIOT GM220-S (523)
//   - 0,01 dBm: sebagian OEM (-1450 = -14.50 dBm)
const paths = [
  "InternetGatewayDevice.DeviceInfo.XponInterface.RXPower",                                     // C-Data
  "InternetGatewayDevice.WANDevice.*.X_GponInterafceConfig.RXPower",                            // Huawei (ejaan vendor "Interafce")
  "InternetGatewayDevice.WANDevice.*.X_ZTE-COM_WANPONInterfaceConfig.RXPower",                  // ZTE F670L / F679D
  "InternetGatewayDevice.WANDevice.*.X_FH_GponInterfaceConfig.RXPower",                         // FiberHome
  "InternetGatewayDevice.WANDevice.*.X_CMCC_EponInterfaceConfig.RXPower",                       // ZTE F609 / F663 (EPON)
  "InternetGatewayDevice.WANDevice.*.X_CMCC_GponInterfaceConfig.RXPower",                       // ZTE CMCC (GPON)
  "InternetGatewayDevice.WANDevice.*.X_CT-COM_EponInterfaceConfig.RXPower",                     // CT-COM EPON, CDTC, ZICG, GM220
  "InternetGatewayDevice.WANDevice.*.X_CT-COM_GponInterfaceConfig.RXPower",                     // CT-COM GPON, HSGQ
  "InternetGatewayDevice.WANDevice.*.X_CU_WANEPONInterfaceConfig.OpticalTransceiver.RXPower",   // ZTE F477 / F677
  "InternetGatewayDevice.X_ALU_OntOpticalParam.RXPower"                                         // Nokia / Alcatel-Lucent
];

function toDbm(v) {
  if (v === undefined || v === null || v === "") return null;
  let n = parseFloat(String(v).replace(/[^0-9.+\-eE]/g, ""));
  if (isNaN(n) || n === 0) return null;
  if (n <= -50) n = n / 100;                                  // 0,01 dBm
  else if (n > 0) n = 30 + Math.log10(n * 1e-7) * 10;         // 0,1 µW
  if (!isFinite(n) || n < -50 || n > 10) return null;
  return n;
}

let m = null;
for (let i = 0; i < paths.length && m === null; i++) {
  const d = declare(paths[i], {value: Date.now()});
  for (let p of d) {
    const raw = Array.isArray(p.value[0]) ? p.value[0][0] : p.value[0];
    const dbm = toDbm(raw);
    if (dbm !== null) { m = dbm; break; }
  }
}

return {
  writable: false,
  value: [m === null ? "N/A" : (Math.round(m * 100) / 100).toFixed(2), "xsd:string"]
};
