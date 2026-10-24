// ALIJAYA-NET virtual PPPoE Uptime.
let totalSecs = "";
if (args[1].value) {
  totalSecs = args[1].value[0];
  declare("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.*.WANPPPConnection.*.Uptime", null, {value: totalSecs});
  declare("InternetGatewayDevice.DeviceInfo.UpTime", null, {value: totalSecs});

}
else {
  let v1 = declare("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.*.WANPPPConnection.*.Uptime", {value: Date.now()});
  let v2 = declare("InternetGatewayDevice.DeviceInfo.UpTime", {value: Date.now()});
//  totalSecs = v1.value[0];
  if (v1.size) {
    totalSecs = v1.value[0];
  }
}
let days = Math.floor(totalSecs / 86400);
let rem  = totalSecs % 86400;
let hrs  = Math.floor(rem / 3600);
if (hrs < 10) {
	hrs = "0" + hrs;
}

rem  = rem % 3600;
let mins = Math.floor(rem / 60);
if (mins < 10) {
	mins = "0" + mins;
}
let secs = rem % 60;
if (secs < 10) {
	secs = "0" + secs;
}

let up = days + "d " + hrs + ":" + mins + ":" + secs;

return {writable: false, value: up};

