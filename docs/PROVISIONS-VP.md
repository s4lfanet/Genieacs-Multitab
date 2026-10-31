# Virtual Parameters, Provisions & Presets

## Virtual Parameters (29)

Semua VP mengembalikan nilai untuk merk apa pun. Kalau parameter tidak ada, VP mengembalikan string kosong, supaya task "refresh VirtualParameters" tidak fault. Nilai VP diperbarui oleh provision `default`.

| VP | Isi | Bisa diubah |
|---|---|---|
| `RXPower` | Daya optik RX (dBm) + kualitas. Huawei, ZTE, FiberHome, CT-COM/CMCC/CU, Nokia (`X_ALU_OntOpticalParam`), C-Data (`XponInterface`) | – |
| `redaman` | RX power (angka dBm) untuk kolom/filter | – |
| `gettemp` | Suhu transceiver (°C), lintas merk | – |
| `getponmode` | GPON/EPON/XPON. Urutan deteksi: WANAccessType → C-Data → objek Gpon/Epon → UpPortMode Huawei | – |
| `getdeviceuptime` | Uptime device (format `Xd hh:mm:ss`) | – |
| `getpppuptime` | Uptime sesi PPPoE | – |
| `getSerialNumber` | SN (hex → teks bila perlu) | – |
| `getaccesstype` | DeviceInfo.AccessType | – |
| `PonMac` | MAC PON | – |
| `IPTR069` | IP WAN untuk TR-069 (WAN IP/PPP yang membawa TR069) | – |
| `pppoeIP` | IP WAN PPPoE (WAN bridge dilewati) | – |
| `pppoeUsername` | Username PPPoE | ✅ |
| `pppoeUsername2` | Username PPPoE (versi untuk halaman index) | – |
| `pppoePassword` | Password PPPoE. Banyak ONT mengembalikan kosong, jadi nilai terakhir yang diset dipertahankan | ✅ |
| `pppIP`, `pppMac`, `pppUsername` | Varian lama (kompatibilitas) | – |
| `WanIP`, `WanMac`, `WanType` | WAN utama (PPPoE dulu, lalu IP), termasuk Nokia (PPPoE di WCD.2+) | – |
| `WlanPassword` | Password WiFi SSID 1. Kalau ONT tidak mengembalikan (Huawei/Nokia), nilai terakhir dipertahankan | ✅ |
| `ssidActive` | Daftar SSID aktif + jumlah client, mis. `Rumah (3) \| Rumah_5G (1)`, untuk index SSID berapa pun | – |
| `activedevices` | Total client WiFi semua SSID aktif | – |
| `userconnected` | TotalAssociations (selalu ada nilai) | – |
| `getAssociation` | Client per SSID (lama) | – |
| `userAdmin` / `userPassword` | Akun **user** web ONT: Huawei, ZTE, FiberHome, CU, CMCC, Nokia (`X_Authentication.Account`) | ✅ |
| `superAdmin` / `superPassword` | Akun **superadmin** web ONT: ZTE `X_ZTE-COM_AdminAccount`/`WebUserInfo`, Nokia `X_Authentication.WebAccount`, dll | ✅ |

Catatan VP password: GenieACS 1.2 memberi `args[1]` = nilai yang di-set dan `args[3]` = nilai tersimpan saat ini. `args[2]` berisi timestamp, bukan nilai.

## Provisions

| Provision | Aktif lewat | Fungsi | Menulis ke ONT? |
|---|---|---|---|
| `bootstrap` | preset `bootstrap` (dipasang otomatis bersama provisions) | Bersihkan cache data model saat BOOTSTRAP | tidak |
| `default` | preset `default` (dipasang otomatis bersama provisions) | Refresh info dasar + semua VP (per jam/harian) | hanya 1 hal: `X_HW_VenderClassID` WAN IP Huawei dikosongkan |
| `inform2` | `--preset-inform` (**dinonaktifkan sementara**, butuh `GM_ENABLE_INFORM=1`) | Setel URL ACS, user/pass ACS, connection request (password deterministik per device), periodic inform | **ya** |
| `useradmin2` | `--preset-useradmin` | Paksa user & superadmin web ONT lewat VP (Nokia memakai password kompleks) | **ya** |
| `remoteweb` | `--preset-remoteweb` | Buka web ONT dari WAN: Huawei (WebUserInfo, AclServices, firewall), ZTE (`IPV4ServiceControl` HTTP/WAN_ALL), FiberHome (`X_FH_ACL.Rule` Direction 1 & 0, `RemoteAccess`), CMCC, Nokia (`X_ALU-COM_WanAccessCfg`) | **ya** |
| `nokia_pppoe` | preset per device buatan Anda | Buat WAN PPPoE di Nokia/ALCL: `args: [vlan, "user", "pass"]` | **ya** |

### Contoh preset `nokia_pppoe` (Admin → Presets)
- Channel: `nokia_pppoe`, Precondition: `DeviceID.ID = "XXXXXX-G%2D1425G%2DH-ALCLXXXXXXXX"`
- Provision: `nokia_pppoe`, args: `30, "user@pppoe", "rahasia"`

Hapus presetnya setelah WAN terbentuk dan PPPoE tersambung.

## Catatan per merk (dari produksi)

**Huawei HG8145V5 / HG8245H5**
- Firmware baru memblokir web dari WAN lewat `X_HW_Security.AclServices.AccessControl` (Mode 1, SrcPortType 2). Jangan perbaiki ini di provision yang jalan setiap inform (lihat TROUBLESHOOTING). Pakai `tools/huawei-remoteweb-report.sh` (laporan saja) dan `tools/fix-huawei-acl.sh` (dry-run default, `apply` untuk mengirim) dalam batch kecil.
- Password WiFi tidak bisa dibaca lewat TR-069 (firmware menyembunyikannya).

**ZTE F670L / F663NV3A / F679D**
- WAN yang dibuat OLT lewat OMCI (`omci_ipv4_*`) tidak bisa diubah via TR-069 (9003). PPPoE diatur di OLT.
- Di OLT C-Data: PPPoE ditambahkan via TR-069 di `WANConnectionDevice.1`. Set `ConnectionType=IP_Routed` **sebelum** Username/Password.
- Remote web = entri `Firewall.X_ZTE-COM_ServiceControl.IPV4ServiceControl` {HTTP, WAN_ALL, Accept, Enable}.
- Beberapa F663NV3A tetap tidak bisa remote web (keterbatasan firmware).

**FiberHome HG6045F3 / HG6145D2**
- Butuh 2 rule `X_FH_ACL.Rule` (Direction 1 dan 0, Protocol ALL). Firmware RP3441 juga butuh `UserInterface.X_FH_WebUserInfo.RemoteAccess="1"`.
- RP3441 punya `X_FH_LogUploader` aktif (mengirim log ke server pihak ketiga). Periksa kalau Anda peduli privasi.

**Nokia / Alcatel-Lucent (ALCL) G-1425G-H**
- Superadmin = `X_Authentication.WebAccount`, user = `X_Authentication.Account`. Password **wajib kompleks**, kalau tidak ditolak dengan 9007.
- Optik/suhu di `X_ALU_OntOpticalParam` (sudah dalam dBm/°C).
- Setiap WAN perlu WANConnectionDevice sendiri. Pada WCD baru, `X_CT-COM_WANGponLinkConfig.Mode=2` harus diset dulu di SPV terpisah sebelum VLAN (karena itu ada provision `nokia_pppoe`).
- Remote web: `X_ALU-COM_WanAccessCfg.HttpDisabled/HttpsDisabled=false`. **Jangan sentuh `Tr69Disabled`**.
- Nokia menyimpan entri WLAN AssociatedDevice yang sudah basi. Pakai TotalAssociations/Host.Active.
