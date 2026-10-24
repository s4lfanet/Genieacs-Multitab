const user = "user";
const superuser = "GANTI_SUPERADMIN"; // GANTI: username superadmin web ONT

// Nokia/Alcatel (ALCL) mewajibkan password kompleks (huruf besar, kecil, angka, simbol)
let mf = declare("DeviceID.Manufacturer", {value: 1});
const isNokia = mf.value && mf.value[0] === "ALCL";
const userpw = isNokia ? "GANTI_User@1" : "GANTI_PASS_USER"; // Nokia wajib password kompleks
const superpw = isNokia ? "GANTI_Super@1" : "GANTI_PASS_SUPER";

// USER ADMIN
let u = declare("VirtualParameters.userAdmin", {value: 1});
if (u.value[0] !== user) {
  declare("VirtualParameters.userAdmin", null, {value: user});
}

// USER PASSWORD
let up = declare("VirtualParameters.userPassword", {value: 1});
if (up.value[0] !== userpw) {
  declare("VirtualParameters.userPassword", null, {value: userpw});
}

// SUPER ADMIN
let su = declare("VirtualParameters.superAdmin", {value: 1});
if (su.value[0] !== superuser) {
  declare("VirtualParameters.superAdmin", null, {value: superuser});
}

// SUPER PASSWORD
let sp = declare("VirtualParameters.superPassword", {value: 1});
if (sp.value[0] !== superpw) {
  declare("VirtualParameters.superPassword", null, {value: superpw});
}
