// ALIJAYA-NET PPPoE Password
let pw = "";
if (args[1].value) {
  pw = args[1].value[0];
  declare("InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Password", null, {value: pw});
}
else {
  let v1 = declare("InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Password", {value: Date.now()});

  for (let p of v1) {
    if (p.value && p.value[0]) {
      pw = p.value[0];
      break;
    }
  }
  // Banyak ONT (Nokia, Huawei) selalu mengembalikan password kosong,
  // jadi pertahankan nilai terakhir yang pernah diset lewat GenieACS
  if (pw === "" && args[3] && args[3].value && args[3].value[0] != null) pw = args[3].value[0];
}

return {writable: true, value: [pw, "xsd:string"]};
