// ALIJAYA-NET Mac Address PPPoE Pada devices berbeda
let m = "";
let w1 = declare("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.MACAddress", {value: Date.now()});
let w2 = declare("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.MACAddress", {value: Date.now()});
let w3 = declare("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.MACAddress", {value: Date.now()});
let w4 = declare("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.2.MACAddress", {value: Date.now()});
				   

if (w1.size) {
  for (let p of w1) {
    if (p.value[0]) {
      m = p.value[0];
      break;
    }
  }
}
else if (w2.size) {
  for (let p of w2) {
    if (p.value[0]) {
      m = p.value[0];
      break;
    }
  }
}
else if (w3.size) {
  for (let p of w3) {
    if (p.value[0]) {
      m = p.value[0];
      break;
    }
  }
}
else if (w4.size) {
  for (let p of w4) {
    if (p.value[0]) {
      m = p.value[0];
      break;
    }
  }
}

return {writable: false, value: [m, "xsd:string"]};


