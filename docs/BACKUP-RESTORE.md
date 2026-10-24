# Backup & Restore

## Backup cepat (config, VP, provisions, presets)

```bash
bash scripts/backup.sh                 # -> backups/<waktu>/
bash scripts/backup.sh /path/tujuan
bash scripts/backup.sh --full          # + dump seluruh database (termasuk devices, faults, tasks, files)
```

Isi folder backup:
- `<koleksi>.archive.gz`: dump per koleksi
- `<koleksi>.empty`: penanda koleksi belum ada saat backup (restore akan mengosongkannya)
- `full-genieacs.archive.gz`: hanya kalau memakai `--full`

`install.sh` selalu membuat backup ini sebelum menulis apa pun.

## Restore

```bash
bash scripts/restore.sh backups/<waktu>
```
Mengganti isi `config`, `virtualParameters`, `provisions`, dan `presets` dengan isi backup, lalu membersihkan cache GenieACS. Data device tidak disentuh.

## Database penuh

Backup penuh secara manual:
```bash
mongodump --db genieacs --archive=genieacs-$(date +%F).archive.gz --gzip
```

Restore penuh, misalnya pindah server:
```bash
sudo systemctl stop genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui
mongorestore --drop --gzip --archive=genieacs-YYYY-MM-DD.archive.gz
sudo systemctl start genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui
```

Restore satu koleksi dari backup penuh:
```bash
mongorestore --drop --gzip --archive=genieacs-YYYY-MM-DD.archive.gz --nsInclude genieacs.config
```

## Migrasi config ke server GenieACS baru

1. Di server baru, instal GenieACS seperti biasa.
2. `git clone` repo ini, lalu `bash scripts/install.sh`.
3. Opsional: edit `provisions/inform2.js` dan `useradmin2.js`, lalu jalankan `install.sh --preset-inform --preset-useradmin`.
4. Arahkan ONT ke server baru, baik lewat URL ACS di OLT/ONT maupun lewat `inform2` di server lama.

Tips: simpan juga backup ke luar server, misalnya `scp` ke laptop atau penyimpanan lain, dan jadwalkan `backup.sh --full` lewat cron harian.
