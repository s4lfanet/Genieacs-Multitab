// ALIJAYA-NET
let serialNumber = "";
let sn = "";
let hexPart = "";

// Hex To Text
let hexToText = (hex) => {
  let text = "";
  for (let i = 0; i < hex.length; i += 2) {
    let hexCode = hex.substr(i, 2);
    let charCode = parseInt(hexCode, 16);
    text += String.fromCharCode(charCode);
  }
  return text;
};
// Check Hex Or String
let isHexadecimal = (str) => {
  return /^[0-9A-Fa-f]+$/.test(str);
};

if (args[1].value) {
  serialNumber = args[1].value[0];
  if (!isHexadecimal(serialNumber)) {
    sn = serialNumber;
  } else if (serialNumber.includes("40ee15")) {
    sn = serialNumber;
  } else {
    hexPart = serialNumber.substr(0, 8);
    let textPart = hexToText(hexPart);
    sn = textPart + serialNumber.substr(8);
  }
  declare("DeviceID.SerialNumber", null, {value: serialNumber});
}
else {
  let snvalue = declare("DeviceID.SerialNumber", {value: Date.now()});
  serialNumber = snvalue.value[0];
  if (!isHexadecimal(serialNumber)) {
    sn = serialNumber;
  } else if (serialNumber.includes("40ee15")) {
    sn = serialNumber;
  } else {
    hexPart = serialNumber.substr(0, 8);
    let textPart = hexToText(hexPart);
    sn = textPart + serialNumber.substr(8);
  }
}

return {writable: false, value: sn};


