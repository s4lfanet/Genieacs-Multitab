// ALIJAYA-NET tes wlan pw
let m = "";
if (args[1].value) {
  m = args[1].value[0];
  declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase", null, {value: m});
  declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase", null, {value: m});
}
else {
  let v1 = declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase", {value: Date.now()});
  let v2 = declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase", {value: Date.now()});


  if (v1.size && v1.value[0]) {
    m = v1.value[0];
  }
  else if (v2.size && v2.value[0]) {
    m = v2.value[0];
  }
  // Banyak ONT (Nokia, Huawei) tidak mengembalikan password WiFi,
  // jadi pertahankan nilai terakhir yang pernah diset lewat GenieACS
  if (m === "" && args[3] && args[3].value && args[3].value[0] != null) m = args[3].value[0];
}

return {writable: true, value: [m, "xsd:string"]};
