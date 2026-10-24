// ALIJAYA-NET PPPoE Username 2 (Index Page)
let user = "";
if (args[1].value) {
  user = args[1].value[0];
  declare("InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Username", null, {value: user});
}
else {
  let v1 = declare("InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Username", {value: Date.now()});

  if (v1.size) {
    user = v1.value[0];
  }
}
if (user.length > 25) {
  user = user.substr(0, 25) + " ...";
}
return {writable: false, value: [user, "xsd:string"]};
