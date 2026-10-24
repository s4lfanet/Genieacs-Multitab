// ALIJAYA-NET PON MODE
// Urutan: 1) WANAccessType (mode yang sedang aktif), 2) C-Data, 3) objek antarmuka Gpon/Epon yang ada di ONT,
// 4) X_HW_UpPortMode Huawei (mode yang diatur; 4 = auto), 5) ZTE PONType, lalu Ethernet.
const daily = Date.now() - 86400000;
let pon = "UNKNOWN";

let getVal = (obj) => {
  if (!obj || !obj.size) return null;
  let v = obj.value[0];
  return Array.isArray(v) ? v[0] : v;
};

let norm = (v) => {
  v = String(v || "").toUpperCase();
  if (v.includes("EPON")) return "EPON";
  if (v.includes("GPON")) return "GPON";
  if (v.includes("XPON")) return "XPON";
  return null;
};

let vendor = String(getVal(declare("DeviceID.Manufacturer", {value: 1})) || "").toUpperCase();

// 1. Mode aktif yang dilaporkan ONT (GPON / EPON / X_CU_EPON / ...)
let access = getVal(declare("InternetGatewayDevice.WANDevice.*.WANCommonInterfaceConfig.WANAccessType", {value: daily}));
pon = norm(access) || "UNKNOWN";

// 2. C-Data (dipertahankan seperti sebelumnya: XPON)
if (pon === "UNKNOWN" && (vendor.includes("CDTC") || vendor.includes("CDATA"))) {
  if (getVal(declare("InternetGatewayDevice.DeviceInfo.XponInterface.RXPower", {value: daily})) !== null) pon = "XPON";
}

// 3. WANAccessType generik ("PON", "Ethernet", kosong): lihat objek antarmuka PON yang ada
if (pon === "UNKNOWN") {
  const base = "InternetGatewayDevice.WANDevice.1.";
  const gpon = ["X_ZTE-COM_GponInterfaceConfig", "X_GponInterafceConfig", "X_FH_GponInterfaceConfig", "X_CMCC_GponInterfaceConfig", "X_CT-COM_GponInterfaceConfig", "X_CU_WANGPONInterfaceConfig"];
  const epon = ["X_CMCC_EponInterfaceConfig", "X_CT-COM_EponInterfaceConfig", "X_FH_EponInterfaceConfig", "X_CU_WANEPONInterfaceConfig"];
  if (gpon.some((o) => declare(base + o, {path: daily}).size)) pon = "GPON";
  else if (epon.some((o) => declare(base + o, {path: daily}).size)) pon = "EPON";
}

// 4. Huawei: mode port yang diatur (1 GPON, 2 EPON, 4 auto/XPON)
if (pon === "UNKNOWN" && vendor.includes("HUAWEI")) {
  let mode = String(getVal(declare("InternetGatewayDevice.DeviceInfo.X_HW_UpPortMode", {value: daily})));
  if (mode === "1") pon = "GPON";
  else if (mode === "2") pon = "EPON";
  else if (mode === "4") pon = "XPON";
}

// 5. ZTE PONType
if (pon === "UNKNOWN") {
  pon = norm(getVal(declare("InternetGatewayDevice.WANDevice.*.X_ZTE-COM_WANPONInterfaceConfig.PONType", {value: daily}))) || "UNKNOWN";
}

if (pon === "UNKNOWN") pon = "Ethernet";

return {writable: false, value: [pon, "xsd:string"]};
