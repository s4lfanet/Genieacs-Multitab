// ALIJAYA NET - Universal MAC Address
let mac = "";
let paths = [
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.MACAddress",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.MACAddress",
  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MACAddress",
  "InternetGatewayDevice.DeviceInfo.X_CU_SerialNumber",
  "Device.PPP.Interface.*.MACAddress"
];

for (let i = 0; i < paths.length; i++) {
  let d = declare(paths[i], {value: 1});
  for (let p of d) {
    if (p.value && p.value[0] && typeof p.value[0] === 'string') {
      let val = p.value[0].trim();
      if (val !== "" && val !== "00:00:00:00:00:00" && val.includes(":")) {
        mac = val;
        break;
      }
    }
  }
  if (mac !== "") break;
}

return {writable: false, value: [mac || "Ethernet", "xsd:string"]};
