# Instal GenieACS dari Nol (Ubuntu 22.04)

Panduan ini untuk server yang **belum punya GenieACS sama sekali**. Kalau GenieACS Anda sudah jalan, langsung ke [INSTALL.md](INSTALL.md).

Diuji end-to-end di Ubuntu 22.04 (VPS fresh, 25 Okt 2026): Node 18, MongoDB 6.0, GenieACS 1.2.13, simulasi Inform TR-069, kelima preset (bootstrap/default/inform/useradmin/remoteweb).

## 1. Paket dasar

```bash
sudo apt-get update
sudo apt-get install -y curl ca-certificates gnupg lsb-release git build-essential
```

## 2. Node.js 18 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo bash -
sudo apt-get install -y nodejs
node -v   # v18.x
```

## 3. MongoDB 6.0 + mongosh + database tools

```bash
curl -fsSL https://pgp.mongodb.com/server-6.0.asc | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-server-6.0.gpg
echo 'deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-6.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/6.0 multiverse' | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org mongodb-mongosh mongodb-database-tools
sudo systemctl enable --now mongod
```

> MongoDB 6+ **tidak lagi menyertakan shell lama `mongo`**, hanya `mongosh`. Semua script di repo ini sudah mendeteksi otomatis mana yang tersedia.

## 4. GenieACS

```bash
sudo npm install -g genieacs@1.2.13   # versi yang dipakai & diuji repo ini
sudo useradd --system --no-create-home --user-group genieacs
sudo mkdir -p /opt/genieacs/ext /var/log/genieacs
sudo chown -R genieacs:genieacs /opt/genieacs /var/log/genieacs
```

Buat `/opt/genieacs/genieacs.env` (ganti `JWT_SECRET` dengan nilai acak Anda sendiri, bukan contoh di bawah):

```bash
JWT=$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')
sudo tee /opt/genieacs/genieacs.env > /dev/null <<EOF
GENIEACS_CWMP_ACCESS_LOG_FILE=/var/log/genieacs/cwmp-access.log
GENIEACS_NBI_ACCESS_LOG_FILE=/var/log/genieacs/nbi-access.log
GENIEACS_FS_ACCESS_LOG_FILE=/var/log/genieacs/fs-access.log
GENIEACS_UI_ACCESS_LOG_FILE=/var/log/genieacs/ui-access.log
GENIEACS_DEBUG_FILE=/var/log/genieacs/debug.yaml
NODE_OPTIONS=--enable-source-maps
GENIEACS_EXT_DIR=/opt/genieacs/ext
GENIEACS_UI_JWT_SECRET=$JWT
GENIEACS_MONGODB_CONNECTION_URL=mongodb://127.0.0.1/genieacs
GENIEACS_NBI_INTERFACE=127.0.0.1
GENIEACS_FS_INTERFACE=127.0.0.1
EOF
sudo chown genieacs:genieacs /opt/genieacs/genieacs.env
sudo chmod 600 /opt/genieacs/genieacs.env
```

`GENIEACS_NBI_INTERFACE` / `GENIEACS_FS_INTERFACE` = `127.0.0.1` membatasi NBI (7557) dan FS (7567) ke localhost saja. **Penting**: NBI tidak punya autentikasi sama sekali — siapa pun yang bisa mengaksesnya bisa baca/ubah semua data ONT. Jangan biarkan terbuka ke internet.

## 5. Systemd service

Untuk tiap `cwmp`, `nbi`, `fs`, `ui`:

```bash
for s in cwmp nbi fs ui; do
sudo tee /etc/systemd/system/genieacs-$s.service > /dev/null <<EOF
[Unit]
Description=GenieACS $s
After=network.target mongod.service

[Service]
User=genieacs
EnvironmentFile=/opt/genieacs/genieacs.env
ExecStart=/usr/bin/genieacs-$s

[Install]
WantedBy=default.target
EOF
done
sudo systemctl daemon-reload
sudo systemctl enable --now genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui
```

Cek: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/` harus `200`.

## 6. Firewall (opsional tapi disarankan)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp      # SSH -- pastikan ini sebelum enable!
sudo ufw allow 7547/tcp    # CWMP, wajib untuk ONT
sudo ufw allow 3000/tcp    # UI
sudo ufw enable
```
Port 7557 (NBI) dan 7567 (FS) **tidak** perlu dibuka — sudah dibatasi ke localhost lewat `genieacs.env` di langkah 4.

## 7. User admin pertama

GenieACS tidak membuat user admin otomatis, dan sekadar punya user saja tidak cukup (lihat [INSTALL.md](INSTALL.md) untuk penjelasan koleksi `permissions`). Setelah clone repo ini:

```bash
git clone https://github.com/s4lfanet/Genieacs-Multitab.git
cd Genieacs-Multitab
bash scripts/create-admin.sh admin 'PasswordKuatAnda'
```

Login di `http://<ip-server>:3000`. Lanjutkan ke [INSTALL.md](INSTALL.md) untuk memasang tampilan multi-tab, Virtual Parameters, dan provisions.
