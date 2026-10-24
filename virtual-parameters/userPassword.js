// virtual parameter user password
const paths = [
  "InternetGatewayDevice.X_CU_Function.Web.UserPassword",
  "InternetGatewayDevice.UserInterface.X_ZTE-COM_WebUserInfo.UserPassword",
  "InternetGatewayDevice.UserInterface.X_HW_WebUserInfo.1.Password",
  "InternetGatewayDevice.DeviceInfo.X_FH_Account.X_FH_WebUserInfo.WebPassword",
  "InternetGatewayDevice.User.2.Password",
  "InternetGatewayDevice.DeviceInfo.X_CT-COM_TeleComAccount.UserAccount.2.Password",
  "InternetGatewayDevice.X_ZTE-COM_UserInterface.X_ZTE-COM_WebUserInfo.UserPassword",
  "InternetGatewayDevice.DeviceInfo.X_CT-COM_TeleComAccount.Password",
  // Nokia / Alcatel-Lucent (ALCL) G-1425G-H dll
  "InternetGatewayDevice.X_Authentication.Account.Password"
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
  // Beberapa ONT (mis. Nokia) selalu mengembalikan password kosong,
  // jadi pertahankan nilai terakhir yang pernah diset lewat GenieACS
  if (m === "" && args[3] && args[3].value && args[3].value[0] != null) m = args[3].value[0];
}

return {writable: true, value: [m, "xsd:string"]};
