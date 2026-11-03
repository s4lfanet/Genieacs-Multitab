# Bridge ONT ZTE (F679D / F670L) lewat GenieACS

Web admin ZTE F679D/F670L tidak punya menu untuk membuat WAN **bridge** dan mengikat port LAN/SSID ke WAN tertentu. Lewat TR-069 keduanya bisa, jadi halaman **Admin → Bridge** (`/bridge.html`) menjalankan langkahnya untuk Anda. Tidak ada service atau port tambahan, dan ONT **tidak di-reboot**.

> Status uji: diuji pada **F679D** (`V9.2.10P5N4A`) dan **F670L** (`V9.0.11P2N38D`): buat bridge di SSID dan port LAN, ubah port, hapus, serta pemindahan/pengembalian port dari PPPoE. WAN PPPoE (dan TR-069) tidak berubah. Catatan F670L: ia tidak punya WAN IP terpisah dan belum punya entri LAN-bind; WAN PPPoE-nya juga jalur TR-069 (`INTERNET_TR069_VOIP`), jadi jangan pernah diubah. Model/firmware lain belum diuji.

## Yang dilakukan halaman

1. Cari ONT ZTE (SN, username PPPoE, atau ID), lalu klik hasilnya.
2. **Kondisi sekarang**: tabel WAN (nama, jenis, VLAN, status, port LAN yang terikat). Data dari cache GenieACS; tombol *Baca ulang dari ONT* mengambil yang terbaru.
3. **Buat bridge baru**: nama WAN, VLAN (bawaan 151), dan port yang di-bridge (LAN1–LAN4, SSID1–SSID8). Port yang sudah dipakai WAN lain diberi tanda dan tidak bisa dipilih, kecuali Anda mencentang *pindahkan*.
4. Pada baris WAN bridge: **Ubah port** dan **Hapus**.

## Langkah TR-069 yang dijalankan (membuat bridge)

| # | Task | Keterangan |
|---|---|---|
| 1 | `refreshObject` WANIPConnection, WANPPPConnection, `X_ZTE-COM_PortBinding` | data terbaru; entri bind sering belum ada di cache |
| 2 | `addObject` `…WANConnectionDevice.1.WANIPConnection` | WAN baru (indeks baru dideteksi sendiri) |
| 3 | SPV `ConnectionType=IP_Bridged`, `Name` | harus lebih dulu |
| 4 | SPV `X_ZTE-COM_VLANEnable=true`, `X_ZTE-COM_VLANID=<vlan>` | |
| 5 | SPV `Enable=true` | |
| 6 | `addObject` `InternetGatewayDevice.X_ZTE-COM_PortBinding` | entri LAN-bind baru |
| 7 | (opsional) lepas port dari bind WAN lain | hanya bila *pindahkan* dicentang |
| 8 | SPV `PortBinding.N.WANInterface=<path WAN>`, `LANInterface=<path port,path port>` | |
| 9 | baca ulang dan **verifikasi** | jenis, VLAN, enable, dan isi bind harus persis sesuai |

Bila ada langkah yang gagal (ONT menolak atau tidak menjawab), objek yang sempat dibuat dihapus lagi dan task/fault yang macet dibersihkan.

### Model data (hasil audit produksi)

- `InternetGatewayDevice.X_ZTE-COM_PortBinding.{i}.WANInterface` = path WAN, mis. `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.2`
- `InternetGatewayDevice.X_ZTE-COM_PortBinding.{i}.LANInterface` = daftar path port dipisah koma: `…LANDevice.1.LANEthernetInterfaceConfig.N` (port kabel) dan `…LANDevice.1.WLANConfiguration.N` (SSID).
- WAN PPPoE bawaan sudah punya entri bind sendiri (mis. LAN1, LAN2, SSID1, SSID5). Satu port tidak boleh ada di dua WAN.
- `WANIPConnection.PossibleConnectionTypes` = `IP_Routed,IP_Bridged`.
- `X_ZTE-COM_ServiceList` hanya menerima nilai yang dikenal ONT (`INTERNET`, `TR069`, `INTERNET_TR069`, …). **`OTHER` ditolak dengan fault 9003**, jadi WAN bridge dibiarkan `INTERNET`.
- Objek `X_ZTE-COM_PortBinding` baru muncul di cache GenieACS setelah `refreshObject` (sebelumnya terlihat kosong walau ONT punya entri).

## Pengaman

- WAN **PPPoE** dan WAN **TR-069** tidak pernah dihapus atau diubah dari halaman ini (pengecekan di kode, bukan hanya tombol yang disembunyikan).
- VLAN yang sudah dipakai WAN lain di ONT itu ditolak.
- Mengambil port dari WAN lain hanya bila dicentang, dan yang diubah hanya daftar `LANInterface` WAN itu, bukan PPPoE-nya sendiri.
- Hanya pengguna yang boleh mengubah Config yang melihat menu ini (aturan yang sama dengan menu Admin lain).

## Yang masih perlu Anda urus di luar ONT

Membuat WAN bridge di ONT tidak otomatis membuat jalurnya hidup. Pastikan **OLT** punya service-port/VLAN yang sama (mis. 151) untuk ONT itu, dan upstream (router/switch) meneruskan VLAN-nya. Tanpa itu WAN akan `Connected` di ONT tetapi tidak ada trafik.

## Pasang

Halaman ikut terpasang lewat **Admin → Update** (komponen UI) atau `bash scripts/ui-admin-menu.sh --all`. Pasang hanya halamannya: `bash scripts/ui-admin-menu.sh --bridge` (digabung dengan flag lain yang sudah terpasang).

Hapus: `bash scripts/ui-admin-menu.sh --remove` (menghapus semua halaman tambahan; bridge yang sudah dibuat di ONT tetap ada).

## Uji

Logika inti halaman (`/*CORE*/ … /*ENDCORE*/` di `map/bridge.html`) tidak menyentuh DOM, sehingga bisa dijalankan di Node terhadap NBI nyata. Skenario yang diuji pada satu F679D: baca model, validasi, hapus, buat, ubah port, penolakan hapus PPPoE/TR-069, penolakan VLAN kembar, kegagalan di tengah jalan (dipaksa) lalu pembersihan otomatis, dan memastikan PPPoE (user, VLAN, bind) tidak berubah.
