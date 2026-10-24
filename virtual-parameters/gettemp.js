// ALIJAYA-NET Parameter pengukuran Temperatur pada perangkat berbeda


let m = "N/A";
let db = "";
let zte1 = declare("InternetGatewayDevice.WANDevice.1.X_CU_WANEPONInterfaceConfig.OpticalTransceiver.Temperature", {value: Date.now()});
let zte2 = declare("InternetGatewayDevice.WANDevice.1.X_CU_WANGPONInterfaceConfig.OpticalTransceiver.Temperature", {value: Date.now()});
let zte3 = declare("InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TransceiverTemperature", {value: Date.now()});
let zte4 = declare("InternetGatewayDevice.WANDevice.1.X_CMCC_EponInterfaceConfig.TransceiverTemperature", {value: Date.now()});
let zte5 = declare("InternetGatewayDevice.WANDevice.1.X_CMCC_GponInterfaceConfig.TransceiverTemperature", {value: Date.now()});
let huawei = declare("InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TransceiverTemperature", {value: Date.now()});
let jze = declare("InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterfaceConfig.TransceiverTemperature", {value: Date.now()});
let jzg = declare("InternetGatewayDevice.WANDevice.1.X_CT-COM_GponInterfaceConfig.TransceiverTemperature", {value: Date.now()});
let fh = declare("InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig.TransceiverTemperature", {value: Date.now()});
let nokia = declare("InternetGatewayDevice.X_ALU_OntOpticalParam.TransceiverTemperature", {value: Date.now()});


const tr069Values = [11509, 11876, 10866, 10592, 11142, 11968];
const temperatures = [45, 46, 42, 41, 43, 46];

const regression = linearRegression(tr069Values, temperatures);

function convertTr069ToTemperature(tr069Value) {
  return regression.slope * tr069Value + regression.intercept;
}


if (zte1.size) {
   let zteval = zte1.value[0]
   if (zteval < 150) {
      m = zteval;
      
    }
    else if (zteval > 150) {
      const tr069Value = zteval;
      const temperature = convertTr069ToTemperature(tr069Value);
	  m = temperature.toFixed(0);
    }
}
else if (zte2.size) {
   let zteval = zte2.value[0]
   if (zteval < 150) {
      m = zteval;
      
    }
    else if (zteval > 150) {
      const tr069Value = zteval;
      const temperature = convertTr069ToTemperature(tr069Value);
	  m = temperature.toFixed(0);
    }
}
else if (zte3.size) {
   let zteval = zte3.value[0]
   if (zteval < 150) {
      m = zteval;
      
    }
    else if (zteval > 150) {
      const tr069Value = zteval;
      const temperature = convertTr069ToTemperature(tr069Value);
	  m = temperature.toFixed(0);
    }
}
else if (zte4.size) {
   let zteval = zte4.value[0]
   if (zteval < 150) {
      m = zteval;
      
    }
    else if (zteval > 150) {
      const tr069Value = zteval;
      const temperature = convertTr069ToTemperature(tr069Value);
	  m = temperature.toFixed(0);
    }
}
else if (zte5.size) {
   let zteval = zte5.value[0]
   if (zteval < 150) {
      m = zteval;
      
    }
    else if (zteval > 150) {
      const tr069Value = zteval;
      const temperature = convertTr069ToTemperature(tr069Value);
	  m = temperature.toFixed(0);
    }
}
else if (huawei.size) {
   let zteval = huawei.value[0]
   if (zteval < 150) {
      m = zteval;
      
    }
    else if (zteval > 150) {
      const tr069Value = zteval;
      const temperature = convertTr069ToTemperature(tr069Value);
	  m = temperature.toFixed(0);
    }
}
else if (jze.size) {
   let zteval = jze.value[0]
   if (zteval < 150) {
      m = zteval;
      
    }
    else if (zteval > 150) {
      const tr069Value = zteval;
      const temperature = convertTr069ToTemperature(tr069Value);
	  m = temperature.toFixed(0);
    }
}
else if (jzg.size) {
   let zteval = jzg.value[0]
   if (zteval < 150) {
      m = zteval;
      
    }
    else if (zteval > 150) {
      const tr069Value = zteval;
      const temperature = convertTr069ToTemperature(tr069Value);
	  m = temperature.toFixed(0);
    }
}
else if (fh.size) {
   let zteval = fh.value[0]
   if (zteval < 150) {
      m = zteval;
      
    }
    else if (zteval > 150) {
      const tr069Value = zteval;
      const temperature = convertTr069ToTemperature(tr069Value);
	  m = temperature.toFixed(0);
    }
}
else if (nokia.size) {
   // Nokia/ALCL: sudah dalam derajat C (string, mis. "40.799999")
   let val = parseFloat(nokia.value[0]);
   if (!isNaN(val)) {
      m = val.toFixed(0);
   }
}

// Fungsi regresi linear
function linearRegression(x, y) {
  const n = x.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}
return {writable: false, value: [m, "xsd:string"]};

