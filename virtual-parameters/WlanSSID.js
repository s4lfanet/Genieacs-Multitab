// ALIJAYA NET - Universal WiFi SSID
if (args[1].value) {
  let val = args[1].value[0];
  declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID", null, {value: val});
  declare("InternetGatewayDevice.LANDevice.*.WLANConfiguration.1.SSID", null, {value: val});
  return {writable: true, value: [val, "xsd:string"]};
}

let ssid = "";
let paths = [
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID",
  "InternetGatewayDevice.LANDevice.*.WLANConfiguration.1.SSID",
  "Device.WiFi.SSID.1.SSID"
];

for (let p of paths) {
  let d = declare(p, {value: 1});
  for (let item of d) {
    if (item.value && item.value[0] && typeof item.value[0] === 'string') {
      let val = item.value[0];
      if (val !== "") {
        ssid = val;
        break;
      }
    }
  }
  if (ssid !== "") break;
}

return {writable: true, value: [ssid, "xsd:string"]};
