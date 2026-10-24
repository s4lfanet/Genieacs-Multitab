// ALIJAYA-NET
let m = "";
if (args[1].value) {
  m = args[1].value[0];
  declare("Device.DeviceInfo.AccessType", null, {value: m});
  declare("InternetGatewayDevice.DeviceInfo.AccessType", null, {value: m});
}
else {
  let d = declare("Device.DeviceInfo.AccessType", {value: Date.now()});
  let igd = declare("InternetGatewayDevice.DeviceInfo.AccessType", {value: Date.now()});

  if (d.size) {
    m = d.value[0];
  }
  else if (igd.size) {
    m = igd.value[0];
  }
}

return {writable: true, value: [m, "xsd:string"]};
