// ALIJAYA-NET RXPower
let m = "N/A";
let db = "";

// ===== TAMBAHAN UNTUK C-DATA (WAJIB) =====
let xpon = declare("InternetGatewayDevice.DeviceInfo.XponInterface.RXPower", {value: Date.now()});

// ===== DECLARE =====
let zte = declare("InternetGatewayDevice.WANDevice.*.X_ZTE-COM_WANPONInterfaceConfig.RXPower", {value: Date.now()});
let huawei = declare("InternetGatewayDevice.WANDevice.*.X_GponInterafceConfig.RXPower", {value: Date.now()});
let fiberhome = declare("InternetGatewayDevice.WANDevice.*.X_FH_GponInterfaceConfig.RXPower", {value: Date.now()});
let nokia = declare("InternetGatewayDevice.X_ALU_OntOpticalParam.RXPower", {value: Date.now()});

let ztecmcc = declare("InternetGatewayDevice.WANDevice.*.X_CMCC_EponInterfaceConfig.RXPower", {value: Date.now()});
let ztecmcg = declare("InternetGatewayDevice.WANDevice.*.X_CMCC_GponInterfaceConfig.RXPower", {value: Date.now()});

let gm220se = declare("InternetGatewayDevice.WANDevice.*.X_CT-COM_EponInterfaceConfig.RXPower", {value: Date.now()});
let gm220sg = declare("InternetGatewayDevice.WANDevice.*.X_CT-COM_GponInterfaceConfig.RXPower", {value: Date.now()});

let f477v2 = declare("InternetGatewayDevice.WANDevice.*.X_CU_WANEPONInterfaceConfig.OpticalTransceiver.RXPower", {value: Date.now()});


// ===== PRIORITAS C-DATA (FIX UTAMA) =====
if (xpon.size) {
   let val = Array.isArray(xpon.value[0]) ? xpon.value[0][0] : xpon.value[0];
   if (val !== undefined && val !== null) {
      m = val;
   }
}

// ===== ZTE =====
else if (zte.size) {
   let zteval = Array.isArray(zte.value[0]) ? zte.value[0][0] : zte.value[0];

   if (zteval < 0) m = zteval;
   else if (zteval > 0) {
      db = 30 + (Math.log10(zteval * Math.pow(10,-7)) * 10);
      m = Math.ceil(db * 100) / 100;
   }
}

// ===== ZTE CMCC =====
else if (ztecmcc.size) {
   let zteval = Array.isArray(ztecmcc.value[0]) ? ztecmcc.value[0][0] : ztecmcc.value[0];

   if (zteval < 0) m = zteval;
   else if (zteval > 0) {
      db = 30 + (Math.log10(zteval * Math.pow(10,-7)) * 10);
      m = Math.ceil(db * 100) / 100;
   }
}

// ===== ZTE GPON =====
else if (ztecmcg.size) {
   let zteval = Array.isArray(ztecmcg.value[0]) ? ztecmcg.value[0][0] : ztecmcg.value[0];

   if (zteval < 0) m = zteval;
   else if (zteval > 0) {
      db = 30 + (Math.log10(zteval * Math.pow(10,-7)) * 10);
      m = Math.ceil(db * 100) / 100;
   }
}

// ===== GM220 =====
else if (gm220se.size) {
   let zteval = Array.isArray(gm220se.value[0]) ? gm220se.value[0][0] : gm220se.value[0];

   if (zteval < 0) m = zteval;
   else if (zteval > 0) {
      db = 30 + (Math.log10(zteval * Math.pow(10,-7)) * 10);
      m = Math.ceil(db * 100) / 100;
   }
}

else if (gm220sg.size) {
   let zteval = Array.isArray(gm220sg.value[0]) ? gm220sg.value[0][0] : gm220sg.value[0];

   if (zteval < 0) m = zteval;
   else if (zteval > 0) {
      db = 30 + (Math.log10(zteval * Math.pow(10,-7)) * 10);
      m = Math.ceil(db * 100) / 100;
   }
}

// ===== F477 =====
else if (f477v2.size) {
   let zteval = Array.isArray(f477v2.value[0]) ? f477v2.value[0][0] : f477v2.value[0];

   if (zteval < 0) m = zteval;
   else if (zteval > 0) {
      db = 30 + (Math.log10(zteval * Math.pow(10,-7)) * 10);
      m = Math.ceil(db * 100) / 100;
   }
}

// ===== HUAWEI =====
else if (huawei.size) {
  for (let p of huawei) {
    let val = Array.isArray(p.value[0]) ? p.value[0][0] : p.value[0];
    if (val !== undefined && val !== null) {
      m = val;
      break;
    }
  }
}

// ===== FIBERHOME =====
else if (fiberhome.size) {
  for (let p of fiberhome) {
    let val = Array.isArray(p.value[0]) ? p.value[0][0] : p.value[0];
    if (val !== undefined && val !== null) {
      m = val;
      break;
    }
  }
}

// ===== NOKIA / ALCATEL (sudah dalam dBm, string) =====
else if (nokia.size) {
  let val = nokia.value[0];
  if (val !== undefined && val !== null && val !== "") {
    m = val;
  }
}


// ===== NORMALISASI FORMAT =====
function normalizeRx(val) {
  if (val === null || val === undefined || val === "N/A") return "N/A";

  let num = parseFloat(val);
  if (isNaN(num)) return "N/A";

  num = Math.round(num * 100) / 100;

  let status = "";
  if (num >= -18) status = "Bagus";
  else if (num >= -25) status = "Lumayan";
  else status = "Jelek";

  return num + " dBm (" + status + ")";
}


// ===== FINAL RETURN =====
return {
  writable: false,
  value: [normalizeRx(m), "xsd:string"]
};
