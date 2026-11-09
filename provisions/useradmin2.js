// useradmin2: paksa akun web ONT (superadmin + user) ke nilai di bawah, lintas merek.
//
// Membaca dan menulis parameter ASLI ONT, bukan cache VirtualParameters. Versi lama hanya membandingkan
// nilai VP dari cache ({value: 1}); bila jalur akun di ONT belum pernah ditemukan GenieACS, penulisan lewat VP
// diam-diam tidak terjadi tetapi VP tetap mencatat nilai target, sehingga ONT tidak pernah diperbaiki
// (contoh nyata: F670L masih "admin", HG6145D2 masih password pabrik, HG8145V5 masih "telecomadmin"/"root").
//
// Alur per akun: temukan isi objek akun (path, mingguan) -> baca nilai (per jam) -> tulis hanya parameter yang ada,
// writable, dan berbeda. Password yang disembunyikan ONT (dibaca "") tidak bisa dibandingkan: ditulis bila
// username baru diperbaiki pada sesi ini, atau sekali saja bila tag penanda belum ada.
const user = "user";
const superuser = "GANTI_SUPERADMIN"; // GANTI: username superadmin web ONT

// Nokia/Alcatel (ALCL) mewajibkan password kompleks (huruf besar, kecil, angka, simbol)
const mf = declare("DeviceID.Manufacturer", {value: 1});
const isNokia = !!(mf.value && mf.value[0] === "ALCL");
const userpw = isNokia ? "GANTI_User@1" : "GANTI_PASS_USER"; // Nokia wajib password kompleks
const superpw = isNokia ? "GANTI_Super@1" : "GANTI_PASS_SUPER";

// Ganti versi tag ini bila password diganti, supaya password tersembunyi ditulis ulang sekali ke semua ONT.
const PW_TAG = "Tags.adminpw_v1";

const now = Date.now();
const weekly = now - 7 * 86400000;
const hourly = now - 3600000;

// [objek, parameter username (null = tidak ada), parameter password]
const SUPER = [
  ["InternetGatewayDevice.UserInterface.X_HW_WebUserInfo.2", "UserName", "Password"],                  // Huawei
  ["InternetGatewayDevice.User.1", "Username", "Password"],                                           // ZTE F670L / F679D
  ["InternetGatewayDevice.UserInterface.X_ZTE-COM_WebUserInfo", "AdminName", "AdminPassword"],         // ZTE lama
  ["InternetGatewayDevice.X_ZTE-COM_UserInterface.X_ZTE-COM_WebUserInfo", "AdminName", "AdminPassword"],
  ["InternetGatewayDevice.DeviceInfo.X_FH_Account.X_FH_WebUserInfo", "WebSuperUsername", "WebSuperPassword"], // FiberHome
  ["InternetGatewayDevice.DeviceInfo.X_CMCC_TeleComAccount", "Username", "Password"],                 // ZTE F609 / F663 (CMCC)
  ["InternetGatewayDevice.DeviceInfo.X_CT-COM_TeleComAccount", null, "Password"],                      // CT-COM: CDTC, GM220, ZICG
  ["InternetGatewayDevice.X_CU_Function.Web", "AdminName", "AdminPassword"],                           // ZTE F677V2 (AdminName read-only)
  ["InternetGatewayDevice.X_Authentication.WebAccount", "UserName", "Password"]                         // Nokia / ALCL
];
const USER = [
  ["InternetGatewayDevice.UserInterface.X_HW_WebUserInfo.1", "UserName", "Password"],
  ["InternetGatewayDevice.User.2", "Username", "Password"],
  ["InternetGatewayDevice.UserInterface.X_ZTE-COM_WebUserInfo", "UserName", "UserPassword"],
  ["InternetGatewayDevice.X_ZTE-COM_UserInterface.X_ZTE-COM_WebUserInfo", "UserName", "UserPassword"],
  ["InternetGatewayDevice.DeviceInfo.X_FH_Account.X_FH_WebUserInfo", "WebUsername", "WebPassword"],
  ["InternetGatewayDevice.X_CU_Function.Web", "UserName", "UserPassword"],                             // read-only di F677V2 -> dilewati
  ["InternetGatewayDevice.X_Authentication.Account", "UserName", "Password"]
];

// Parameter yang ada dan writable: {value} atau null
function read(path) {
  const d = declare(path, {value: hourly, writable: weekly});
  if (!d.size) return null;
  for (const p of d) {
    if (p.writable === false) return null;
    return {value: p.value ? p.value[0] : ""};
  }
  return null;
}

const tag = declare(PW_TAG, {value: 1});
const pwTagSet = !!(tag.size && tag.value && tag.value[0]);
let hiddenPwWritten = false;

// Objek akun milik merek lain tidak ada di ONT ini. Cek keberadaan dengan info struktur yang SUDAH tersimpan
// ({path: 1}: tidak memaksa GetParameterNames baru), supaya penemuan isi hanya dilakukan pada objek yang ada.
// Tanpa ini, menemukan ke-16 objek lintas merek butuh belasan GetParameterNames berurutan per sesi dan sesi
// gagal dengan "too_many_commits" (semua channel di sesi itu ikut fault).
const known = {};
function exists(obj) {
  if (!(obj in known)) known[obj] = declare(obj, {path: 1}).size > 0;
  return known[obj];
}

function ensure(list, name, pw) {
  for (const [obj, nameKey, pwKey] of list) {
    if (!exists(obj)) continue;
    declare(obj + ".*", {path: weekly});   // temukan isi objek (tidak mengambil nilai)
    let nameFixed = false;
    if (nameKey) {
      const n = read(obj + "." + nameKey);
      if (n && n.value !== name) {
        declare(obj + "." + nameKey, null, {value: name});
        nameFixed = true;
      }
    }
    const p = read(obj + "." + pwKey);
    if (!p) continue;
    if (p.value !== "" && p.value != null) {
      if (p.value !== pw) declare(obj + "." + pwKey, null, {value: pw});
    } else if (nameFixed || !pwTagSet) {      // password tersembunyi
      declare(obj + "." + pwKey, null, {value: pw});
      hiddenPwWritten = true;
    }
  }
}

ensure(SUPER, superuser, superpw);
ensure(USER, user, userpw);

if (hiddenPwWritten && !pwTagSet) declare(PW_TAG, null, {value: true});

// Segarkan VP tampilan (UI, bot, aplikasi Android) dari nilai ONT yang baru
declare("VirtualParameters.superAdmin", {value: hourly});
declare("VirtualParameters.userAdmin", {value: hourly});
