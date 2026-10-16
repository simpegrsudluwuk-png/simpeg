# SIMPEG RSUD Luwuk

Sistem Informasi Manajemen Kepegawaian RSUD Luwuk — dibangun ulang di atas
Google Apps Script + Google Spreadsheet, mengikuti pola arsitektur project
E-Filing & CUTI.

Repo ini berisi **backend (GAS)** dan **frontend (statis, GitHub Pages)**
yang dipisah:

- Frontend memanggil backend lewat `fetch` (`Content-Type: text/plain`)
  ke URL deployment `/exec` — **bukan** `google.script.run`.
- Backend di-deploy dengan GitHub Actions (Apps Script API + service account),
  bukan clasp.

## Lingkungan

| Item | Nilai |
|---|---|
| Apps Script ID | `1bKp5S04wKvd2VCr9YpiofkRfuQlCJLSTnaGj6hnVwuXfKMi3g1bRjeMe` (di `backend/.clasp.json`) |
| Deployment web-app (URL backend) | `https://script.google.com/macros/s/AKfycbx7Bmc_8371a6Kd1CYC4KsNVUknAgZgLWoF_BAfnN852XycaYY7ScwcIs599O2yaMUa/exec` |
| Frontend (GitHub Pages) | `https://simpegrsudluwuk-png.github.io/simpeg/` |
| Repo GitHub | `https://github.com/simpegrsudluwuk-png/simpeg` |
| Spreadsheet DB | `15ynh0d2BIlJFFGoXhGU3Km11Hznx4ksO7XdgZudx0aw` (disimpan di sheet `Config`) |
| Sumber data migrasi | `1FufDIsnjH3wsXNKwh4PoOCUovXlJ1-IhOG0LmXLYS7A` ("SIMPEG RSUD LUWUK" — 896 detail + 1215 master absen) |
| App lama (referensi review) | `_review-app-lama/` + `docs/REVIEW-APP-LAMA.md` |

## Struktur Project

```
backend/
  .clasp.json        # scriptId (dipakai referensi & lokal)
  src/               # kode Apps Script (00_Config.js … 99_Diagnosis.js, web/)
  deploy_gas.mjs     # deploy via Apps Script API + service account (tanpa clasp)
frontend/            # situs statis (Vite + Preact shell, UI di public/app.js)
  index.html         # entry Vite (aset publik di public/)
  public/            # style.css, app.js — disalin apa adanya ke dist/
  dist/              # hasil build (di-gitignore, dipublish CI ke gh-pages)
.github/workflows/
  deploy-frontend.yml  # push frontend/** → build → branch gh-pages → GitHub Pages
  deploy-backend.yml   # workflow_dispatch → Apps Script API → push + versi + deploy
docs/                # dokumentasi (review, database design, install, user guide)
PROGRESS.md          # catatan progres
```

## Deploy

### Frontend (otomatis)

Ubah apa pun di `frontend/**` → push ke `main` → GitHub Actions build dan
publish ke branch `gh-pages` → live di
`https://simpegrsudluwuk-png.github.io/simpeg/`.

### Backend (GitHub Actions — butuh prasyarat sekali di browser Google)

Workflow **Deploy GAS Backend** (tab Actions → Run workflow) menjalankan
`backend/deploy_gas.mjs`: push konten `backend/src/` → buat versi baru →
arahkan deployment `AKfycbx7…` ke versi baru (**URL /exec tidak pernah
berubah**, jadi `frontend/public/app.js` tidak perlu diedit).

Prasyarat (sekali saja, lakukan manual dengan akun Google yang berwenang):

1. Aktifkan **Apps Script API** di GCP project milik service account
   (project `simpeg-rsudluwuk` / nomor `546083972389`):
   https://console.developers.google.com/apis/api/script.googleapis.com/overview?project=546083972389
2. Buka editor Apps Script (ID di tabel Lingkungan) → **Share** →
   tambahkan `opencode-google@simpeg-rsudluwuk.iam.gserviceaccount.com`
   sebagai **Editor**.

Setelah prasyarat terpenuhi, aktifkan kembali trigger `push` di
`.github/workflows/deploy-backend.yml` (hapus tanda `#`).

Secret repo: `CLASP_CREDENTIALS` = isi file JSON service account.

### Backend (lokal)

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "D:\PROJECT\KREDENSIAL-JASON\simpeg-rsudluwuk.json"
cd backend
node deploy_gas.mjs
```

## Catatan Penting

- Frontend **tidak pernah** menyimpan token/secret; semua data & otorisasi
  di backend. Frontend selalu mengirim `Content-Type: text/plain`
  (body string JSON) agar kena preflight CORS.
- Jangan commit `*.json` kredensial service account — sudah masuk
  `.gitignore` (`backend/service-account.json`).
- `frontend/dist/` dan `node_modules/` tidak di-commit.
- Klaim akses akun Google pengguna tetap lewat sheet `Users` di spreadsheet.

## Dokumentasi

- `docs/REVIEW-APP-LAMA.md` — hasil review aplikasi lama (temuan, kekurangan, pemetaan modul)
