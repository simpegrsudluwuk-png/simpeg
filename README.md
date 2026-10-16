# SIMPEG RSUD Luwuk

Sistem Informasi Manajemen Kepegawaian RSUD Luwuk — dibangun ulang di atas
Google Apps Script + Google Spreadsheet, mengikuti pola arsitektur project
E-Filing & CUTI.

## Lingkungan

| Item | Nilai |
|---|---|
| Apps Script ID | `1bKp5S04wKvd2VCr9YpiofkRfuQlCJLSTnaGj6hnVwuXfKMi3g1bRjeMe` (di `.clasp.json`) |
| Spreadsheet DB | `15ynh0d2BIlJFFGoXhGU3Km11Hznx4ksO7XdgZudx0aw` (disimpan di sheet `Config`) |
| Sumber data migrasi | `1FufDIsnjH3wsXNKwh4PoOCUovXlJ1-IhOG0LmXLYS7A` ("SIMPEG RSUD LUWUK" — 896 detail + 1215 master absen) |
| App lama (referensi review) | `_review-app-lama/` + `docs/REVIEW-APP-LAMA.md` |

## Quick Start

```powershell
npm install
npx clasp login          # sekali, pakai akun pemilik script
npx clasp push           # kirim kode (src/ -> Apps Script)
npm run deploy           # deploy web app
```

Lalu buka spreadsheet → jalankan menu **SIMPEG → Install Database**.

## Struktur Project

```
.clasp.json          # scriptId + rootDir=src
package.json         # script clasp
.gitignore
docs/                # dokumentasi (review, database design, install, user guide)
PROGRESS.md          # catatan progres
src/                 # kode Apps Script (dipush ke GAS)
web/                 # (rencana) partial UI SPA
```

> Folder `_review-app-lama/` berisi hasil clone aplikasi lama
> (script `1hC1k8d67MDP9lutXaD9idEn3SGuhs6CWegEdxgDVaEHIBD4MAxccP-uX`)
> sebagai bahan referensi. **Jangan pernah di-push ke script baru.**

## Dokumentasi

- `docs/REVIEW-APP-LAMA.md` — hasil review aplikasi lama (temuan, kekurangan, pemetaan modul)
