# Voice AI (menu Admin → Voice AI)

Halaman tanya-jawab dengan asisten AI memakai **suara atau ketikan**, terinspirasi halaman "Voice AI" di Multitab Alijaya, tetapi ditulis ulang agar memakai bot Multitab sendiri (tanpa backend `agent.py`, tanpa port tambahan, tanpa kunci pihak lain).

## Cara kerja

1. Halaman `map/voice.html` (menu **Voice AI** di sidebar, grup Bot) menulis pertanyaan ke Config GenieACS `voice.q`.
2. Layanan `genieacs-wa-bot` (`bot/wa.js` → `core.voiceStart`) memeriksa `voice.q` tiap 2 detik dan menjawab dengan asisten AI yang **sama dengan perintah `/tanya`** (hanya membaca data ONT, tidak mengubah apa pun), lalu menulis jawabannya ke `voice.a`.
3. Halaman membaca `voice.a` dan menampilkan jawaban; suara masuk/keluar memakai fitur bawaan browser (`SpeechRecognition` dan `speechSynthesis`, bahasa `id-ID`).

Pola ini sama dengan halaman Bot WA (Config sebagai jalur komunikasi), jadi hanya butuh port GenieACS yang sudah ada dan berjalan lewat Cloudflare Tunnel.

## Syarat

- Asisten AI aktif: Admin → Pengaturan Bot → `bot.ai.enabled = true` dan isi `bot.ai.apiKey` (provider Anthropic/OpenRouter/OpenAI-compatible; lihat [TELEGRAM-BOT.md](TELEGRAM-BOT.md)). Kuota harian `bot.ai.dailyLimit` berlaku untuk Voice AI juga.
- Layanan `genieacs-wa-bot` berjalan (`scripts/setup-wa-bot.sh`). **Nomor WhatsApp tidak perlu ditautkan**; layanan itu hanya dipakai sebagai penjawab.
- Akun GenieACS yang membuka halaman punya izin ubah Config (sama seperti menu bot lainnya).
- Mikrofon: browser hanya mengizinkannya di **HTTPS atau `localhost`**. Lewat `http://IP-LAN:3000` tombol mikrofon akan menolak; ketik saja pertanyaannya, atau akses lewat domain HTTPS (Cloudflare Tunnel). Pengenalan suara bawaan Chrome/Edge/Safari butuh internet.

## Catatan

- Jawaban dibatasi 4000 karakter dan pertanyaan 500 karakter. Pertanyaan yang lebih pendek dari 5 karakter ditolak.
- Setiap pertanyaan tercatat di `audit.log` bot (`TANYA voice ...`).
- Tidak ada riwayat percakapan disimpan di server; hanya pertanyaan dan jawaban terakhir ada di Config (`voice.q`, `voice.a`).
- Pasang/ulang menu: `bash scripts/ui-admin-menu.sh --all` (atau `--voice`). Updater memasangnya otomatis bila bot WA terpasang.
