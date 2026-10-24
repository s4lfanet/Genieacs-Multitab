// virtual parameter user admin
const paths = [
  "InternetGatewayDevice.X_CU_Function.Web.UserName",
  "InternetGatewayDevice.UserInterface.X_ZTE-COM_WebUserInfo.UserName",
  "InternetGatewayDevice.UserInterface.X_HW_WebUserInfo.1.UserName",
  "InternetGatewayDevice.DeviceInfo.X_FH_Account.X_FH_WebUserInfo.WebUsername",
  "InternetGatewayDevice.User.2.Username",
  "InternetGatewayDevice.DeviceInfo.X_CT-COM_TeleComAccount.UserAccount.2.UserName",
  "InternetGatewayDevice.X_ZTE-COM_UserInterface.X_ZTE-COM_WebUserInfo.UserName",
  // Nokia / Alcatel-Lucent (ALCL) G-1425G-H dll
  "InternetGatewayDevice.X_Authentication.Account.UserName"
];

let m = "";
if (args[1].value) {
  m = args[1].value[0];
  for (let p of paths) declare(p, null, {value: m});
}
else {
  for (let p of paths) {
    let v = declare(p, {value: Date.now() - 3590000});
    if (v.size && v.value && v.value[0] != null && v.value[0] !== "") {
      m = v.value[0];
      break;
    }
  }
}

return {writable: true, value: [m, "xsd:string"]};
