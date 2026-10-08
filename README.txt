VAULT PWA

Isi folder:
- index.html
- manifest.json
- service-worker.js
- icon-192.png
- icon-512.png

UPLOAD KE GITHUB:
1. Buka repo https://github.com/shopppit1-tech/vault
2. Buka branch main.
3. Replace index.html dengan index.html dari folder ini.
4. Upload manifest.json, service-worker.js, icon-192.png, icon-512.png ke root repo.
5. Pastikan GitHub Pages tetap: main / (root).

URL:
https://shopppit1-tech.github.io/vault/

INSTALL DI ANDROID:
1. Buka URL di Chrome.
2. Tunggu halaman selesai dimuat.
3. Jika tombol "Install Vault" muncul, tekan tombol itu.
4. Jika tidak muncul, tekan menu Chrome (⋮) -> "Tambahkan ke layar utama" / "Install app".
5. Ikon Vault akan muncul di layar HP.

Catatan:
- PWA membutuhkan HTTPS. GitHub Pages sudah HTTPS.
- Data Vault tetap memakai Supabase yang sudah dikonfigurasi.
- Service worker hanya menangani shell aplikasi; request Supabase tetap ke jaringan.
