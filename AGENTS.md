# SIMPEG RSUD Luwuk

Aplikasi kepegawaian berbasis Google Apps Script + Google Spreadsheet, di-host sebagai Web App internal (`USER_ACCESSING`, `DOMAIN`) lewat HtmlService. Bukan GitHub Pages.

## Layout

```
src/               Sumber kebenaran backend + frontend GAS
  00_Config.js     CONFIG, ROLES, PERMISSIONS
  01_Schema.js     Definisi sheet / schema
  02_Setup.js      Install database & seed idempoten
  10_Utils.js      Util umum + parser kepegawaian (normalisasi nik/nip/npwp, masa kerja, pensiun)
  11_Auth.js       Google sign-in + RBAC
  12_Log.js        Audit trail + retensi log
  20_SheetRepo.js  CRUD generik + validasi + LockService
  21_Migrasi.js    Migrasi/import ke GAS
  30_Pegawai.js, 31_Riwayat.js, 32_Monitoring.js
  40_Dashboard.js
  51_Usulan.js, 52_Sk.js, 53_Laporan.js
  90_Api.js        Router doGet/doPost + otorisasi + include
  99_Diagnosis.js  Diagnosa struktur/data/baca
  web/             Frontend HtmlService (index.html, style.html, app.html)
tools/             Generator migrasi lokal (Python)
data-migrasi/      CSV hasil pembersihan data
docs/              Catatan review app lama
```

- `src/` adalah sumber kebenaran. Jangan edit `_review-app-lama/` kecuali analisis.
- Penomoran file `NN_Nama.js` harus dipertahankan untuk urutan beban/push.
- Untuk perubahan schema, tulis migration/idempotent di `02_Setup.js` atau `21_Migrasi.js`, bukan patch manual ad-hoc.

## Identitas

- Apps Script project: `SIMPEG AI RSUD LUWUK`
- Time zone: `Asia/Makassar` (WITA)
- `appsscript.json`: `runtimeVersion: V8`, `exceptionLogging: STACKDRIVER`
- Web app: `executeAs: USER_ACCESSING`, `access: DOMAIN`
- Halaman internal dibuka lewat URL `/exec`; login otomatis via Google sign-in user.

## Endpoint / router

- Satu router di `90_Api.js`: `doGet`, `include`, `apiCall`.
- Otorisasi selalu lewat `authorize()` / `izinkan...()`, bukan hanya UI.
- User dari Google sign-in (`executeAs: USER_ACCESSING`), sehingga identitas tersedia untuk RBAC & audit.
- Endpoint JSON internal tidak perlu pola CORS GitHub Pages (`text/plain`) karena frontend berada di domain GAS yang sama, tetapi tetap gunakan helper output yang konsisten.

## Perintah

```bash
npm run login
npm run push
npm run pull
npm run watch
npm run open
npm run deploy
npm run logs
npm run versions
```

Pemeriksaan sebelum menyatakan selesai:
- `node --check src/*.js` atau minimal file yang berubah
- `clasp push` sukses
- uji browser: login, akses halaman sesuai role, operasi CRUD kritis, monitoring, usulan, SK, laporan
- kalau ada perubahan schema/setup, pastikan `installDatabase()` diuji di editor GAS
- jangan jalankan `clasp deploy` tanpa izin eksplisit pengguna

## Konvensi kode

- File `.js` numbered by domain (`00_Config`, `01_Schema`, ...). Jangan digabung menjadi `Code.gs`.
- Helper internal berakhiran underscore: `formatTanggal_()`, `norm_()`, `jsonOut_()`, `log_()`.
- Fungsi yang dipanggil frontend/internal tidak berakhiran underscore.
- Baca `references/gotchas.md` setiap kali menulis file baru atau mengubah router `doGet` / `apiCall`.
- Harga, status, role, dan data sensitif **selalu** dibaca dari sheet/config, tidak dari payload client.
- Validasi required/unique dan audit perubahan berada di repo layer (`20_SheetRepo.js`).
- LockService wajib untuk update sheet yang bisa ditulis pengguna.
- Jangan pakai `getLastRow()` untuk ID. Hitung dari nilai yang dibaca.
- Tanggal diformat lewat utilitas lokal (`formatDate()` di `10_Utils.js`), bukan `Utilities.formatDate()`.

## Performa (wajib diperhatikan)

SIMPEG sebesar Pegawai 896+ baris. Performa sudah pernah menjadi masalah:

- `formatDate()` memakai `Utilities.formatDate()` terlalu mahal per sel.
- Pembacaan sheet di-cache per eksekusi (`repo().all()`), workbook di-cache per eksekusi, dan kolom hanya yang dibutuhkan.
- Untuk operasi massal gunakan chunk 500–1000 baris.
- Dashboard dan monitoring membaca banyak tabel sekaligus; selalu ukur `ujiKecepatanBaca()` bila utilitas baru ditambahkan.

## Keamanan & data

- `webapp.access = DOMAIN`, user internal (RSUD Luwuk).
- RBAC 5 role + matriks akses; otorisasi di backend, bukan frontend.
- Audit trail (`12_Log.js`) untuk perubahan pegawai/riwayat/usulan.
- Data migrasi legacy ada di `_review-app-lama/` dan CSV `data-migrasi/`; data sheet aktual sumber kebenaran.
- Secret/config (SK pejabat, threshold monitoring, dsb.) dari sheet `Config`, bukan hardcode.
- Token/clasp (`~/.clasprc.json`) jangan disimpan di repo.

## Khusus gotchas SIMPEG

- NIK rusak dari CSV (notasi ilmiah) harus dinormalisasi di `10_Utils.js`.
- Tanggal lahir didukung format `“13 Januari 1993”`.
- Fungsi `clasp run` bisa gagal `NOT_FOUND`; eksekusi kritis dijalankan user dari editor GAS.
- Selalu cek ulang `src/appsscript.json` setelah `clasp pull` (pull menimpa manifest).
- Setelah `clasp push`, property `FONNTE`/secret table jika ditambah harus dicatat di panduan deploy bila ada.

## Status proyek

- Fase 0–4 selesai dan sudah deploy (`@3` lalu `@14`).
- Fase 5 (uji tim, dokumentasi lanjut, integrasi CUTI/absensi) belum selesai.
- ## Model frontend: embedded vs GitHub Pages

- Project ini memakai **embedded frontend / HtmlService**: frontend ada di
  `src/web/`, di-serve Apps Script. Pola yang benar di sini:
  - gunakan `include` + `google.script.run` atau router internal GAS
  - **jangan** terapkan masalah CORS GitHub Pages (tidak perlu `text/plain` fetch dari domain bebas)
  - tidak ada URL `/exec` yang dipanggil frontend browser
  - akses mengikuti `webapp.access = DOMAIN`
- Model **GitHub Pages terpisah** dipakai untuk repo frontend seperti
  WAWA Bakery. Pola itu berlaku hanya bila frontend repo terpisah:
  - fetch ke URL deployment berakhiran `/exec`
  - `Content-Type: text/plain`
  - tidak ada secret, harga, atau perhitungan final di client
  - Vite `base: '/nama-repo/'` untuk project page
  - deploy lewat GitHub Actions + Settings → Pages → GitHub Actions
  - biasanya membutuhkan access `ANYONE_ANONYMOUS` atau strategi auth frontend
- **Jangan** campur dua model: jangan menyalin pola Pages ke project
  embedded, dan jangan memaksakan `google.script.run` ke frontend Pages.
- Kalau front E-Filing/SIMPEG nanti dipindah ke GitHub Pages, buat repo
  terpisah, buat panduan deploy baru, dan catat URL `/exec` deployment
  resmi sebelum frontend diubah.