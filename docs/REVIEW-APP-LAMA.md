# Review Aplikasi SIMPEG Lama

- **Tanggal review**: 13 Oktober 2026
- **Cara review**: clone penuh via clasp (read-only, tidak ada perubahan di sisi Google)
- **Script ID**: `1hC1k8d67MDP9lutXaD9idEn3SGuhs6CWegEdxgDVaEHIBD4MAxccP-uX`
- **Spreadsheet sumber**: `1FufDIsnjH3wsXNKwh4PoOCUovXlJ1-IhOG0LmXLYS7A` ("SIMPEG RSUD LUWUK")
- **Kode hasil clone**: folder `_review-app-lama/` (11 file, referensi saja — JANGAN di-push)

---

## 1. Arsitektur Aplikasi Lama

### Manifest (`appsscript.json`)
| Item | Nilai | Catatan |
|---|---|---|
| timeZone | `Asia/Shanghai` | ⚠️ Zona Tiongkok. Kebetulan UTC+8 sama dengan WITA (Luwuk), tapi nama zona salah — seharusnya `Asia/Makassar`. Kalau trigger dijadwalkan ulang dengan asumsi zona ini, jam berjalan bisa salah kalau Google mengubah mapping. |
| webapp.executeAs | `USER_DEPLOYING` | File xlsx/pdf diunduh memakai OAuth token orang yang deploy |
| webapp.access | `ANYONE_ANONYMOUS` | 🔴 **Siapa pun dengan URL bisa buka & UBAH data kepegawaian** — lihat Temuan K-1 |

### Model Data (10 sheet di spreadsheet SIMPEG)
| Sheet | Fungsi |
|---|---|
| `Tbl Bio` | Biodata statis (14 kolom), 1 baris/pegawai |
| `Tbl Rwyt Status` | Riwayat status kepegawaian |
| `Tbl Rwyt Pend` | Riwayat pendidikan |
| `Tbl Rwyt Pangkat` | Riwayat pangkat/golongan/jabatan |
| `Tbl Rwyt T4 Tugas` | Riwayat tempat tugas/unit kerja |
| `Tbl Masa Kerja` | TMT RS pertama/terakhir + masa kerja |
| `Tbl Rwyt SIP-STR` | Riwayat SIP & STR |
| `Tbl Rwyt KGB` | Riwayat Kenaikan Gaji Berkala |
| `Tbl Reff` | Tabel referensi dropdown (dibaca via kolom & baris tetap) |
| `Tbl Pegawai` | 🔄 **Hasil generate** — rekap pegawai AKTIF (44 kolom) |
| `Tbl Dashboard` / `Tbl Profil` | 🔄 **Hasil formula `=QUERY`** dari Tbl Pegawai |
| `Tbl Notifikasi` | 🔄 Hasil generate modul notifikasi (dibaca widget) |
| `Tbl Dokumen` | Metadata DMS (ID ABSEN → link PDF Drive) |

### Modul Kode (11 file)
| File | Isi |
|---|---|
| `SIMPEG.js` (52 KB, 1244 baris) | Inti: CONFIG/HEADERS, helper sheet, util tanggal, Tbl Reff, `rebuildTblPegawai()`, API frontend |
| `Notifikasi.js` | Precompute `Tbl Notifikasi` tiap jam; reminder SIP/STR (H-28/21/14/7) & KGB (H-7/6/5); event kalender + email KGB |
| `DMS.js` | Upload/preview/download 1 PDF per pegawai → folder Drive hardcode |
| `DownloadPegawai.js` | Ekspor Tbl Pegawai xlsx/pdf/csv, kolom dipilih user |
| `Downloadpegawaifilter.js` | Ekspor lanjutan: filter status + rentang TMT |
| `Inputriwayat.js` | Input bulk beberapa jenis riwayat sekaligus |
| `Diagnosis.js` | Fungsi troubleshooting dari editor (test semua pegawai, cek kesehatan sheet) |
| `index.html` / `JavaScript.html` (60 KB) / `Stylesheet.html` | SPA vanilla JS + Chart.js |

## 2. Fitur Yang Sudah Ada (pertahankan idenya)

1. **Dashboard**: total pegawai, kartu PNS/P3K/Honor, 7 chart (gender, agama, golongan top-10, pendidikan, jurusan top-10, usia, unit×jabatan stacked)
2. **Data Pegawai**: daftar + pencarian + halaman detail 7 tab (biodata, status, pendidikan, pangkat, tempat tugas, SIP/STR, KGB)
3. **Tambah Pegawai**: form multi-section (biodata + status wajib + riwayat opsional)
4. **Input Riwayat**: bulk per pegawai untuk pegawai yang sudah ada
5. **DMS**: 1 PDF gabungan per pegawai, upsert (ganti = hapus file lama)
6. **Notifikasi**: monitor SIP/STR/KGB jatuh tempo, event kalender + email
7. **Download**: xlsx/pdf/csv kolom terpilih + filter status/tanggal
8. **Diagnosis**: modul uji backend dari editor Apps Script
9. **Rebuild engine**: merge data riwayat terbaru → Tbl Pegawai (materialized view); auto-rebuild via `onEdit` + trigger jam-an

## 3. Temuan & Kekurangan

### 🔴 Kritis
| # | Temuan | Dampak |
|---|---|---|
| K-1 | **Tanpa autentikasi/otorisasi sama sekali** (`ANYONE_ANONYMOUS`, tanpa Google sign-in, tanpa role) | Siapa pun yang punya URL bisa melihat **dan mengubah** data kepegawaian termasuk NIP/NPWP/gaji. Tidak ada jejak siapa mengubah apa. |
| K-2 | **Token clasp owner-only**: semua tulis jalan sebagai `USER_DEPLOYING` | Semua perubahan dari web app tercatat sebagai satu akun deployer; tidak bisa dibedakan operator mana yang input. |

### 🟠 Arsitektur
| # | Temuan | Dampak |
|---|---|---|
| A-1 | `Tbl Dashboard` & `Tbl Profil` adalah **hasil formula `=QUERY`** | Kolom baru wajib edit formula manual; pernah jadi sumber bug "pegawai tidak ditemukan" (lihat komentar FIX 1/3/4 di kode). Rentang formula pecah → data hilang diam-diam. |
| A-2 | Rebuild **tulis ulang seluruh sheet** (`clearContents` + `setValues`) tiap kali ada perubahan | Boros; berisiko race condition (ditambal `LockService`). Semakin besar data, semakin lambat. |
| A-3 | Rebuild dipicu **ganda**: `onEdit` setiap edit + trigger tiap jam | Konsumsi kuota eksekusi berlipat. |
| A-4 | Semua logika inti menumpuk di 1 file 52 KB | Sulit dirawat, tidak ada pemisahan util/repo/API. |
| A-5 | **Tanpa cache**: `getPegawaiRingkas()` baca seluruh Tbl Pegawai tiap boot lalu kirim ke browser | Berat untuk ±900 baris; lambat dibuka. |
| A-6 | **Config hardcode di kode**: ID folder DMS, kalender, ID spreadsheet | Ganti folder/kalender = edit kode + deploy ulang. |
| A-7 | **`Tbl Reff` dibaca via kolom & rentang baris tetap** (`GOL=A`, `JABATAN=I/H`…) | Tata letak sheet reff berubah sedikit = dropdown pecah tanpa error jelas. |
| A-8 | **Zona waktu `Asia/Shanghai`** (bukan `Asia/Makassar`) | Inkonsisten dengan lokasi rumah sakit (WITA). |

### 🟡 Data & Logika
| # | Temuan | Dampak |
|---|---|---|
| D-1 | **Tanpa validasi format** NIK/NIP/NPWP (data produksi: 13 NIK rusak `7,20105E+15`, 148 NIP anomali "Non DB BKN"/"Honor") | Data cacat masuk sistem tanpa hambatan. |
| D-2 | **Status hanya "Aktif"** — tidak ada pensiun/mutasi/berhenti; yang non-aktif langsung hilang dari rekap | Riwayat kepegawaian tidak utuh; pegawai keluar = data hilang dari dashboard. |
| D-3 | **Pensiun (DHT) tidak dihitung** | Tidak ada peringatan pegawai mendekati batas pensiun. |
| D-4 | **KGB berikutnya dihitung kasar +2 tahun** dari TMT terakhir | Tidak sesuai aturan KGB (berdasarkan gaji berkala terakhir; data `GAJI BERKALA TERAKHIR` 99% kosong). |
| D-5 | **Notifikasi hanya jendela 40 hari ke depan / 14 hari ke belakang** | 130 SIP/STR yang sudah expired lama tidak terdorong tindakan; jatuh tempo >40 hari tak terpantau. |
| D-6 | **TMT disimpan sebagai teks** ("01 Maret 2024") di Tbl Pegawai | Sulit sort/filter berdasarkan tanggal di sheet; membebani konversi bolak-balik. |

### 🟢 Operasional
| # | Temuan | Dampak |
|---|---|---|
| O-1 | **Tanpa test harness** (project CUTI & E-Filing sudah punya) | Regresi sulit terdeteksi. |
| O-2 | **Tanpa audit log** | Tidak bisa melacak perubahan data. |
| O-3 | Ekspor xlsx/pdf pakai spreadsheet sementara + `UrlFetchApp` + OAuth token user | Kalau diakses anonim, jalur ini bergantung token deployer; file sementara di-Trash bisa menumpuk bila proses gagal di tengah. |
| O-4 | `generateSuratPengajuanKGB()` baru **stub** | Fitur usulan KGB/SK belum ada. |

## 4. Hal Baik Yang Dipertahankan di App Baru

1. **Model riwayat terpisah per aspek** (Bio + Rwyt Status/Pend/Pangkat/T4/SIP-STR/KGB) — fondasi yang benar.
2. **`ID ABSEN` sebagai kunci penghubung** semua tabel.
3. **Konsep materialized view** (Tbl Pegawai sebagai rekap jadi) — versi baru: cache di memori + invalidasi, bukan tulis-ulang sheet.
4. **`parseDateFlexible_`** — sudah menangani "Seumur Hidup", leading zero tidak konsisten, format campuran. Reuse.
5. **Modul notifikasi precompute jam-an** — arsitektur hemat quota yang benar.
6. **DMS sederhana** (1 PDF/pegawai, upsert) sesuai kebiasaan operator.
7. **Ekspor kolom terpilih + filter** — UX yang disukai user.
8. **Modul Diagnosis** — pola troubleshooting yang bagus, dipertahankan sebagai `99_Diagnosis`.
9. **Komentar [FIX n]** di kode — dokumentasi inline yang luarlihat informatif.

## 5. Pemetaan Modul Lama → Baru

| File lama | Modul baru (rencana) |
|---|---|
| `SIMPEG.js` (helper + rebuild + API) | `10_Utils.js`, `20_SheetRepo.js`, `30_Pegawai.js`, `31_Riwayat.js` |
| `Notifikasi.js` | `32_Monitoring.js` (SIP/STR/KGB/DHT, window fleksibel) |
| `DMS.js` | `34_DokumenFile.js` (folder dari sheet Config) |
| `DownloadPegawai.js` + `Downloadpegawaifilter.js` | `50_Laporan.js` |
| `Inputriwayat.js` | `31_Riwayat.js` (bulk) |
| `Diagnosis.js` | `99_Diagnosis.js` |
| `index/JavaScript/Stylesheet.html` | `web/` SPA (pola E-Filing: hash router) |
| *(baru)* | `00_Config.js`, `01_Schema.js`, `02_Setup.js`, `11_Auth.js`, `12_Log.js`, `21_Migrasi.js`, `40_Dashboard.js`, `60_Admin.js`, `90_Api.js` |

## 6. Keputusan yang Sudah Dikonfirmasi User

- Bangun app baru di spreadsheet & script baru (bukan reuse yang lama).
- Kode JENIS PEGAWAI / GOL = **teks bebas**, tidak dinormalisasi (dropdown dari nilai existing).
- SIMPEG = master data; integrasi CUTI & absensi di fase berikutnya.
- Pengguna internal: Subbag Kepegawaian + pimpinan.
- Prioritas fitur: Dashboard + alert, Master pegawai & riwayat, Usulan KP/KGB + generator SK, Laporan & ekspor.
