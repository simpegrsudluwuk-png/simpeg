# Catatan Progres — SIMPEG RSUD Luwuk

Terakhir diperbarui: 13 Oktober 2026

## Status Fase

- [x] **Fase 0 — Setup project & review app lama**
  - [x] Install `@google/clasp` (v3.4.1)
  - [x] Clone app lama `1hC1k8d67MDP9lutXaD9idEn3SGuhs6CWegEdxgDVaEHIBD4MAxccP-uX` → `_review-app-lama/`
  - [x] Review 11 file (backend 7 + frontend 3 + manifest) → `docs/REVIEW-APP-LAMA.md`
  - [x] Scaffold project baru: `.clasp.json`, `package.json`, `.gitignore`, `src/appsscript.json`, `README.md`
  - [x] **Verifikasi akses script baru** — user sudah share; script terakses
    (title "SIMPEG AI RSUD LUWUK"; isinya masih stub `myFunction`)
  - [x] Manifest lengkap dipasang: Asia/Makassar, webapp DOMAIN + USER_ACCESSING, oauthScopes
- [x] **Fase 1 — Schema + Setup + seed** (kode selesai, terpush; DB terinstal)
  - [x] `00_Config.js` — CONFIG, ROLES, PERMISSIONS (5 role, matriks akses)
  - [x] `01_Schema.js` — 12 sheet ternormalisasi: Config, Users, UnitKerja,
    Pegawai, RiwayatStatus, RiwayatPendidikan, RiwayatPangkat,
    RiwayatJabatan, RiwayatKGB, MasaKerja, Dokumen, LogAktivitas
  - [x] `10_Utils.js` — util umum + khusus kepegawaian (parser "13 Januari 1993",
    normalisasi NIK rusak `7,20105E+15`, NIP, NPWP, email/HP error,
    hitung umur, masa kerja, pensiun DHT, mask data sensitif)
  - [x] `11_Auth.js` — Google sign-in + RBAC + `authorize()` per request
  - [x] `12_Log.js` — audit trail + retensi log
  - [x] `20_SheetRepo.js` — generic CRUD + validasi required/unique + LockService
  - [x] `02_Setup.js` — installDatabase idempoten + seed config/unit/user admin
  - [x] `99_Diagnosis.js` — diagnosaStruktur/diagnosaData/diagnosaSemua
  - [x] `node --check` lulus; `clasp push` sukses; installDatabase dijalankan
    user di editor → 12 sheet terbentuk di spreadsheet DB baru
- [x] **Fase 2 — Migrasi & pembersihan data** (via CSV impor, bypass eksekusi GAS)
  - [x] `21_Migrasi.js` (versi GAS) siap — namun eksekusi editor macet/hang
    dan `clasp run` error storage; environment eksekusi project ini tidak stabil
  - [x] **Jalur alternatif**: `tools/generate_migrasi.py` memproses data
    secara LOKAL dengan aturan pembersihan identik → `data-migrasi/*.csv`
  - [x] Impor CSV selesai & terverifikasi: Pegawai 896 · RiwayatStatus 896 ·
    RiwayatPendidikan 896 · RiwayatPangkat 893 · RiwayatJabatan 894 ·
    RiwayatKGB 120 · MasaKerja 892 · Dokumen 845 · UnitKerja 77 (10 seed + 67 baru)
  - [x] Verifikasi lokal: 0 ID duplikat, 0 tanpa riwayat status, 0 FK yatim,
    0 email duplikat. Sisa anomali (10 tanpa NIK, 1 tanpa tgl lahir,
    1 NIK kembar, 319 gap absen) tercatat di sheet "Laporan Migrasi"
- [x] **Fase 3 — Modul inti** ✅ (SELESAI — ter-push & ter-deploy)
  - [x] `30_Pegawai.js` — daftar/filter, detail lengkap, simpan/hapus, audit
  - [x] `31_Riwayat.js` — CRUD 5 jenis riwayat + masa kerja, audit per jenis
  - [x] `32_Monitoring.js` — mesin tenggat SIP/STR (Dokumen), KGB (+2 th),
        pensiun/DHT; ambang dari Config (NOTIF_*_HARI)
  - [x] `40_Dashboard.js` — statistik (jenis, unit, jabatan, gol, usia,
        agama, pendidikan) + ringkasan monitoring, cache 5 menit
  - [x] `90_Api.js` — `doGet`, `include`, `apiCall` (router + otorisasi),
        `opsiAplikasi` (config.opsi), `izinkanRiwayat` (otorisasi per jenis)
  - [x] `web/index.html` + `web/style.html` + `web/app.html` — SPA:
        Dashboard, Data Pegawai (filter+cari+paging), Detail Pegawai
        (biodata + 5 tab riwayat + dokumen), Monitoring (tab SIP/STR/KGB/
        Pensiun), modal form biodata & riwayat, layar "belum terdaftar"
  - [x] `node --check` lolos · `clasp push -f` (18 file) ·
        `clasp deploy` → **@3**
  - [ ] Uji di browser oleh user (dashboard, cari pegawai, detail,
        monitoring, tambah/edit riwayat, tambah pegawai)
- [x] **Fase 4 — Usulan KP/KGB + generator SK + Laporan** ✅ (SELESAI — @14)
  - [x] Skema ditambah 2 tabel: `Usulan` (KP/KGB + status + gol/gaji +
        TMT + jejak keputusan) & `UsulanRiwayat` (siapa mengajukan/
        menyetujui/menolak) — 14 sheet total
  - [x] `51_Usulan.js` — alur DRAF → DIAJUKAN → DISETUJUI/DITOLAK,
        nomor usulan otomatis (`NNN/KP.RSUD/TAHUN`), golongan berikutnya
        otomatis, masa kerja dihitung, peringatan masa kerja < 1 tahun
  - [x] `52_Sk.js` — generator SK: pratinjau HTML + simpan **.doc ke
        Drive** (folder `SIMPEG - SK`), terbilang gaji, tanda tangan dari
        Config (`SK_PEJABAT`, `SK_JABATAN_PEJABAT`)
  - [x] `53_Laporan.js` — rekap unit × jenis, golongan, jadwal KGB,
        mendekati pensiun, rekap usulan, ekspor data pegawai
  - [x] UI: menu **📋 Usulan** & **📊 Laporan** (6 tab, cetak PDF +
        unduh CSV), modal buat/edit usulan, tombol aksi sesuai izin
  - [x] User menjalankan `installDatabase` (sheet Usulan & UsulanRiwayat
        sudah dibuat) dan menguji halaman baru — **aman, tidak macet**
- [ ] Fase 5 — Uji bersama tim + dokumentasi + tindak lanjut data

## 🔧 Perbaikan performa besar (ditemukan bersama, sangat penting)

**Gejala:** semua halaman berat hanya menampilkan "Memuat…" sampai
hang, padahal halaman ringan (profil/konfigurasi) berjalan normal.

**Penyebab (terukur, bukan dugaan):** `formatDate()` memakai
`Utilities.formatDate()`, di mana tiap sel tanggal dihitung ±52 ms dan
`getTimezone()` memanggil `PropertiesService` setiap kali. Tabel Pegawai
punya 3 kolom tanggal untuk 896 baris, sehingga satu kali baca tabel
makan ±68 detik; dashboard membaca 7 tabel → jauh melewati batas
6 menit GAS, sehingga request dibunuh (terlihat seperti "hang").

**Perbaikan:** format tanggal dihitung langsung dari komponen kalender
zona skrip (Asia/Makassar) tanpa `Utilities.formatDate`, plus:
workbook di-cache per eksekusi, hasil baca (`repo().all()`) di-cache
per-eksekusi, & pembacaan kolom hanya yang dibutuhkan.

**Hasil:** langkah `RiwayatKGB` turun dari **12.510 ms → ±2-3 detik**
(termasuk overhead tetap google.script.run ±2 detik), dan seluruh
halaman kini normal. Pelajaran: utilitas Apps Script bisa sangat mahal
walau kodenya terlihat "sepele" — selalu ukur lewat pembacaan baris.

**Alat bantu yang dipertahankan:** halaman **🩺 Diagnosa** (ukuran
sheet, uji baca bertingkat, diagnosa 12 langkah), tombol **Rapikan
Sheet** (membuang baris/kolom kosong sisa impor CSV), dan fungsi
`ujiKecepatanBaca()` di editor.

## ⏭️ Titik lanjut
1. **Data:** lengkapi 382 SIP + 10 STR yang kosong "TMT Valid" (belum
   bisa dipantau), 10 pegawai tanpa NIK, 1 tanpa tanggal lahir.
2. **Config SK:** isi `SK_PEJABAT` & `SK_JABATAN_PEJABAT` di sheet
   **Config** → keluaran SK siap tanda tangan.
3. **Opsional — tabel gaji:** kalau ada daftar gaji resmi, dibuat modul
   matriks gaji (golongan × masa kerja → gaji pokok) agar KP/KGB terisi
   otomatis, tanpa input manual.
4. **Fase 5:** uji bersama tim Subbag Kepegawaian & pimpinan, panduan
   pemakaian, registrasi User (sheet `Users`) beserta perannya.

## 🔗 Web App (deployment)
- URL /exec: https://script.google.com/macros/s/AKfycbyUsvjPGTXJKxbNE16nvnAH4q_soP7k-ZMeNIXGXZWt0XHnFhoMx0OzfoQgZGGx-PAw/exec
- Deployment ID: `AKfycbyUsvjPGTXJKxbNE16nvnAH4q_soP7k-ZMeNIXGXZWt0XHnFhoMx0OzfoQgZGGx-PAw`
- Setelah `clasp push`, perbarui rilis dengan:
  `clasp deploy -i AKfycbyUsvjPGTXJKxbNE16nvnAH4q_soP7k-ZMeNIXGXZWt0XHnFhoMx0OzfoQgZGGx-PAw -d "..."`
- [ ] Fase 2 — Migrasi & pembersihan data
- [ ] Fase 3 — Modul inti (Pegawai, Riwayat, Dashboard, Monitoring)
- [ ] Fase 4 — Usulan KP/KGB + generator SK + Laporan
- [ ] Fase 5 — Deploy, uji bersama tim, dokumentasi

## Masalah Terbuka

_(kosong)_

## Catatan
- Eksekusi via `clasp run` (API scripts.run) gagal dengan error
  "server error occurred while reading from storage. NOT_FOUND" untuk
  project ini — bahkan fungsi trivial. Eksekusi dari **editor browser
  berjalan normal**. Jadi: fungsi dijalankan user di editor, hasilnya
  ditempel ke sini / dicek dari log.

- clasp kadang gagal refresh token otomatis (gejala: "The caller does not
  have permission" padahal sudah pernah berhasil). Kalau muncul lagi:
  `npx clasp login` ulang, atau update `~/.clasprc.json`.
- `clasp pull` menimpa file lokal — manifest `src/appsscript.json` harus
  dicek ulang setiap sesudah pull (versi lengkap ada di git/repo ini).

## Keputusan Desain (sudah dikonfirmasi)

- Zona waktu `Asia/Makassar` (WITA) — menggantikan `Asia/Shanghai` di app lama.
- Akses internal: `webapp.access = DOMAIN`, `executeAs = USER_ACCESSING`
  (email user terdeteksi untuk RBAC & audit).
- Kode JENIS PEGAWAI / GOL = teks bebas (tidak dinormalisasi).
- SIMPEG = master; integrasi CUTI & absensi fase berikutnya.
