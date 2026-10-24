# Halaman Device Multi-Tab

## Isi tab

| Tab | Isi |
|---|---|
| 📊 **Ringkasan** | Last inform, uptime, merk/tipe/SN/firmware, mode PON, RX power + kualitas, suhu, PPPoE user/password/IP, IP TR-069, SSID aktif + jumlah client, tags. Terbuka otomatis. |
| 🌐 **WAN & WiFi** | **Bagian umum** (semua merk): tabel WAN per WANConnectionDevice (PPP & IP: nama, status, user/pass, IP, uptime) dan semua SSID (aktif, security, password, channel, client). Di bawahnya **Parameter Setting** khusus per merk (VLAN, service list, LAN bind, dll). |
| 🖧 **LAN Host** | Daftar perangkat yang terhubung (hostname, IP, MAC, tipe) + Summon |
| 🔧 **LAN Config** | IP LAN router, subnet, DHCP server on/off, start/end, gateway, DNS, lease, relay; status/kecepatan port LAN |
| 🔐 **Admin Web** | User/password web ONT (user & superadmin, lewat VP) dan **ACS / TR-069**: URL, user/pass ACS, connection request user/pass/URL, periodic inform + interval, tombol Summon |
| ⚠️ **Fault** | Fault device |
| 📋 **Semua Parameter** | Pohon parameter lengkap |

Tombol aksi device (Reboot, Reset, Push file, Delete) tampil di semua tab.

Bagian untuk model **TR-181** (`Device.*`) dan **TR-098** (`InternetGatewayDevice.*`) dipilih otomatis lewat filter `... .ManagementServer.URL IS NOT NULL`.

## Cara kerja

GenieACS 1.2 tidak punya komponen tab. Tab dibuat **hanya dengan Config** `ui.device.*`:

1. Komponen `container` boleh memakai *selector* mithril sebagai `element`. Jadi config bisa membuat elemen `style`, `input[type=radio]`, dan `label[for=...]`.
2. Entri `ui.device.0` (ping) diberi tambahan bar tab: satu `style` berisi CSS, lalu pasangan `input#acs-tN.acs-r` + `label.acs-l`.
3. Setiap entri tingkat atas `ui.device.N` diberi class panel `acs-p acs-pK` lewat `element`, misalnya `'div.acs-p.acs-p2'`.
4. CSS: `body:has(#acs-t2:checked) .acs-p2{display:block}` dan panel lain disembunyikan. Tanpa radio terpilih, panel 1 (Ringkasan) yang tampil.

Pemetaan panel saat ini:

| Panel | Entri `ui.device.N` |
|---|---|
| acs-p1 Ringkasan | 1 (umum non-MikroTik), 13 (MikroTik) |
| acs-p2 WAN & WiFi | 2 (bagian umum + judul), 3–12, 14 (per merk) |
| acs-p3 LAN Host | 15, 16 |
| acs-p7 LAN Config | 23 |
| acs-p4 Admin Web | 17, 18, 19 (19.components.1/2 = ACS) |
| acs-p5 Fault | 20, 21 |
| acs-p6 Semua Parameter | 22 |
| (selalu tampil) | 0 ping + bar tab, 24 device-actions |

## Menambah bagian ke tab yang ada

Tambahkan komponen baru di dalam entri panel tersebut. Contoh, menambah satu parameter ke tab LAN Config:

```
ui.device.23.components.0.components.1.parameters.10.label     = 'Domain'
ui.device.23.components.0.components.1.parameters.10.parameter = InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DomainName
```

## Menambah tab baru

1. Buat entri tingkat atas baru (sebelum `device-actions`) dengan `element = 'div.acs-p.acs-p8'`.
2. Di `ui.device.0.components.1.components.*` tambahkan pasangan:
   - `input`: `type='container'`, `element='input#acs-t8.acs-r[type=radio][name=acstab]'`, **`components.0.type=''`** (wajib, lihat di bawah)
   - `label`: `type='container'`, `element='label.acs-l.acs-l8[for=acs-t8]'`, `components.0='Judul Tab'`
3. Tambahkan `body:has(#acs-t8:checked) .acs-p8` ke aturan `{display:block}` terakhir di CSS (`ui.device.0.components.1.components.0.components.0`).

## Aturan penting saat mengedit Config UI

- **Setiap nilai `ui.*` dibaca sebagai ekspresi GenieACS.** Teks harus diberi kutip tunggal: `'teks'`. Nilai yang tidak bisa diparse, misalnya teks yang berisi kutip tunggal atau backslash di dalamnya, membuat **UI crash dan HTTP 500 untuk semua user**. Karena itu CSS di repo ini sengaja tanpa kutip dan tanpa backslash.
- Komponen `container` **wajib** punya `components`. Kalau tidak ada, yang tampil tulisan "Error!". Untuk elemen kosong seperti `input`, beri `components.0.type = ''`.
- Container tanpa `element` tidak membuat elemen pembungkus. Untuk bisa memberi class panel, bungkus dengan `element='div.acs-p...'`.
- Selalu backup sebelum mengedit (`bash scripts/backup.sh`), lalu cek `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/` beberapa kali.

## Tabel umum: ikon hapus

Tabel WAN umum menampilkan ikon 🗑 bawaan GenieACS di setiap baris, dan ikon ini tidak bisa disembunyikan lewat config. Satu baris = satu WANConnectionDevice. **Menghapus WAN TR-069 memutus ONT dari ACS.**
