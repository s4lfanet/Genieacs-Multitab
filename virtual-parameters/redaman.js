// ALIJAYA-NET
let m = "N/A";
let db = "";
let zte = declare("InternetGatewayDevice.WANDevice.*.X_ZTE-COM_WANPONInterfaceConfig.RXPower", {value: Date.now()});
let huawei = declare("InternetGatewayDevice.WANDevice.*.X_GponInterafceConfig.RXPower", {value: Date.now()});
let fiberhome = declare("InternetGatewayDevice.WANDevice.*.X_FH_GponInterfaceConfig.RXPower", {value: Date.now()});
let nokia = declare("InternetGatewayDevice.X_ALU_OntOpticalParam.RXPower", {value: Date.now()});
let ztecmcc = declare("InternetGatewayDevice.WANDevice.*.X_CMCC_EponInterfaceConfig.RXPower" , {value: Date.now()});
let ztecmcg = declare("InternetGatewayDevice.WANDevice.*.X_CMCC_GponInterfaceConfig.RXPower" , {value: Date.now()});
let gm220se = declare("InternetGatewayDevice.WANDevice.*.X_CT-COM_EponInterfaceConfig.RXPower" , {value: Date.now()});
let gm220sg = declare("InternetGatewayDevice.WANDevice.*.X_CT-COM_GponInterfaceConfig.RXPower" , {value: Date.now()});
let f477v2 = declare("InternetGatewayDevice.WANDevice.*.X_CU_WANEPONInterfaceConfig.OpticalTransceiver.RXPower"	, {value: Date.now()});

if (zte.size) {
   let zteval = zte.value[0]
   if (zteval < 0) {
      m = zteval;
      
    }
    else if (zteval > 0) {
      db = 30 + (Math.log10((zteval * (Math.pow(10,-7))))*10);
	  m = Math.ceil(db * 100) / 100;
    }
}
else if (ztecmcc.size) {
   let zteval = ztecmcc.value[0]
   if (zteval < 0) {
      m = zteval;
      
    }
    else if (zteval > 0) {
      db = 30 + (Math.log10((zteval * (Math.pow(10,-7))))*10);
	  m = Math.ceil(db * 100) / 100;
    }
}
else if (ztecmcg.size) {
   let zteval = ztecmcg.value[0]
   if (zteval < 0) {
      m = zteval;
      
    }
    else if (zteval > 0) {
      db = 30 + (Math.log10((zteval * (Math.pow(10,-7))))*10);
	  m = Math.ceil(db * 100) / 100;
    }
}
else if (gm220se.size) {
   let zteval = gm220se.value[0]
   if (zteval < 0) {
      m = zteval;
      
    }
    else if (zteval > 0) {
      db = 30 + (Math.log10((zteval * (Math.pow(10,-7))))*10);
	  m = Math.ceil(db * 100) / 100;
    }
}
else if (gm220sg.size) {
   let zteval = gm220sg.value[0]
   if (zteval < 0) {
      m = zteval;
      
    }
    else if (zteval > 0) {
      db = 30 + (Math.log10((zteval * (Math.pow(10,-7))))*10);
	  m = Math.ceil(db * 100) / 100;
    }
}
else if (f477v2.size) {
   let zteval = f477v2.value[0]
   if (zteval < 0) {
      m = zteval;
      
    }
    else if (zteval > 0) {
      db = 30 + (Math.log10((zteval * (Math.pow(10,-7))))*10);
	  m = Math.ceil(db * 100) / 100;
    }
}
else if (huawei.size) {
  for (let p of huawei) {
    if (p.value[0]) {
      m = p.value[0];
      break;
    }
  }
}
else if (fiberhome.size) {
  for (let p of fiberhome) {
    if (p.value[0]) {
      m = p.value[0];
      break;
    }
  }
}
else if (nokia.size) {
  // Nokia/ALCL: sudah dalam dBm (string, mis. "-15.606673")
  if (nokia.value[0]) {
    m = Math.round(parseFloat(nokia.value[0]) * 100) / 100;
  }
}
return {writable: false, value: [m, "xsd:string"]};

