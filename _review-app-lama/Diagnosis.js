/*************************************************************
 * SIMPEG RS - Modul Diagnostik (Troubleshoot Profil/Detail Pegawai)
 *
 * File TERPISAH dari Code.gs, satu project -> bebas memakai semua
 * konstanta & helper Code.gs (CONFIG, HEADERS, sheet_(),
 * getSheetHeaders_(), readSheetAsObjects_(), getKeyValue_(),
 * normalizeId_(), getPegawaiDetail(), dst).
 *
 * TUJUAN: mengetes fungsi backend LANGSUNG dari editor Apps Script
 * (tombol "Run"), TANPA lewat web app / HTML / klik tombol apa pun
 * di browser. Kalau hasil di sini SUDAH BENAR tapi tombol
 * "Lihat"/klik nama di web app tetap gagal, berarti masalahnya ada
 * di frontend (JavaScript.html). Kalau hasil di sini SUDAH SALAH/
 * kosong, berarti masalahnya ada di data sheet atau logic backend
 * (Tbl Profil, Tbl Pegawai, dst) -- jadi kita tahu persis harus
 * benerin di mana.
 *
 * CARA PAKAI:
 *   1. Buka project ini di script.google.com (Apps Script editor).
 *   2. Buka file "Diagnostics.gs" ini.
 *   3. Di dropdown pilihan fungsi (sebelah tombol "Run" / "Jalankan"
 *      di toolbar atas), pilih "testProfilPegawai", klik Run.
 *   4. Buka "Execution log" (menu View > Logs, atau Ctrl+Enter)
 *      untuk melihat hasilnya.
 *   5. Ulangi untuk "testDetailPegawai" (boleh tanpa argumen --
 *      otomatis pakai ID Absen pertama yang ditemukan di Tbl Bio).
 *      Untuk mengetes ID tertentu, edit baris
 *      TEST_ID_ABSEN_OVERRIDE di bawah, isi ID yang mau dites,
 *      lalu Run ulang.
 *************************************************************/

// Isi dengan ID Absen tertentu untuk dites (mis. 'A001'), atau
// biarkan '' supaya testDetailPegawai() otomatis memakai ID Absen
// pertama yang ditemukan di Tbl Bio.
var TEST_ID_ABSEN_OVERRIDE = '';

// ====== 0. TES SEMUA PEGAWAI SEKALIGUS (BUKAN CUMA 1 ID) ==========
//
// testDetailPegawai() di bawah cuma mengetes 1 ID -- kalau ID yang
// kepilih otomatis kebetulan bukan salah satu dari 895 pegawai yang
// tampil di halaman "Data Pegawai" (spt kasus sebelumnya: "29176"
// ternyata memang belum "Aktif" jadi tidak masuk Tbl Pegawai sama
// sekali, BUKAN representasi dari bug "Lihat" yang dilaporkan),
// hasilnya jadi menyesatkan.
//
// Fungsi ini menguji SEMUA 895 pegawai yang benar-benar ada di
// "Tbl Pegawai" (persis daftar yang tampil di halaman Data Pegawai)
// sekaligus, dan melaporkan PERSIS ID mana saja yang bakal gagal
// kalau diklik "Lihat". Supaya cepat (tidak baca sheet berulang
// 895x), tiap sheet cukup dibaca SEKALI lalu di-index di memori.
function testSemuaPegawaiDetail() {
  Logger.log('========== testSemuaPegawaiDetail() MULAI ==========');

  var pegawaiRows = readSheetAsObjects_(CONFIG.SHEET_PEGAWAI);
  if (!pegawaiRows.length) {
    Logger.log('[GAGAL] "Tbl Pegawai" kosong -- jalankan "Update Tabel Pegawai" dulu.');
    return;
  }
  Logger.log('Menguji seluruh ' + pegawaiRows.length + ' pegawai di Tbl Pegawai (daftar yang sama persis dengan halaman Data Pegawai)...');

  // Baca tiap sheet SEKALI saja, index by ID ABSEN ternormalisasi,
  // supaya tidak perlu re-baca sheet 895 kali (jauh lebih cepat &
  // aman dari batas waktu eksekusi).
  function indexBy(sheetName) {
    var map = {};
    try {
      readSheetAsObjects_(sheetName).forEach(function (r) {
        var id = normalizeId_(getKeyValue_(r));
        if (!map[id]) map[id] = [];
        map[id].push(r);
      });
    } catch (e) {
      Logger.log('[PERINGATAN] Gagal baca sheet "' + sheetName + '": ' + e.message);
    }
    return map;
  }

  var profilMap = indexBy(CONFIG.SHEET_PROFIL);

  var berhasil = 0;
  var gagalTidakDiProfil = [];
  var gagalError = [];

  pegawaiRows.forEach(function (row) {
    var id = getKeyValue_(row);
    var idNorm = normalizeId_(id);
    var nama = row['NAMA'] || '(tanpa nama)';

    if (!profilMap[idNorm] || !profilMap[idNorm].length) {
      gagalTidakDiProfil.push({ id: id, nama: nama });
      return;
    }

    // Panggil fungsi ASLI yang dipakai web app (bukan simulasi), supaya
    // exception apa pun di dalamnya (mis. sheet riwayat rusak) ikut
    // ketangkap persis seperti yang akan dialami user saat klik "Lihat".
    try {
      var raw = getPegawaiDetail(id);
      // [FIX] getPegawaiDetail() sekarang return STRING JSON (lihat
      // catatan di Code.gs), bukan object langsung -- perlu di-parse.
      var detail = raw ? JSON.parse(raw) : null;
      if (!detail) {
        gagalTidakDiProfil.push({ id: id, nama: nama });
      } else {
        berhasil++;
      }
    } catch (e) {
      gagalError.push({ id: id, nama: nama, pesan: e.message });
    }
  });

  Logger.log('--- HASIL ---');
  Logger.log('Total pegawai         : ' + pegawaiRows.length);
  Logger.log('Berhasil (aman dibuka) : ' + berhasil);
  Logger.log('GAGAL - null/tak ketemu: ' + gagalTidakDiProfil.length);
  Logger.log('GAGAL - error/exception: ' + gagalError.length);

  if (gagalTidakDiProfil.length) {
    Logger.log('--- Daftar ID gagal (null), maks 30 ditampilkan ---');
    Logger.log(JSON.stringify(gagalTidakDiProfil.slice(0, 30), null, 2));
  }
  if (gagalError.length) {
    Logger.log('--- Daftar ID gagal (melempar error), maks 30 ditampilkan ---');
    gagalError.slice(0, 30).forEach(function (g) {
      Logger.log(g.id + ' (' + g.nama + '): ' + g.pesan);
    });
  }

  if (!gagalTidakDiProfil.length && !gagalError.length) {
    Logger.log('[KESIMPULAN] SEMUA ' + pegawaiRows.length + ' pegawai berhasil diproses getPegawaiDetail() tanpa error. Backend 100% sehat untuk seluruh data yang ada.');
    Logger.log('-> Karena backend terbukti sehat untuk SEMUA pegawai, masalah "Lihat"/klik nama yang kamu alami di web app HAMPIR PASTI ada di sisi FRONTEND (JavaScript.html) atau cache browser/deployment lama, BUKAN di data/backend. Cek Console browser (F12) saat klik tombol "Lihat", dan pastikan sudah Deploy > New version setelah update file terakhir.');
  } else {
    Logger.log('[KESIMPULAN] Ada pegawai yang benar-benar gagal di backend -- daftar ID di atas itulah yang perlu diperbaiki datanya (Tbl Profil/riwayat), bukan soal frontend.');
  }

  Logger.log('========== testSemuaPegawaiDetail() SELESAI ==========');
}

// ====== 1. CEK KESEHATAN SHEET "Tbl Profil" & "Tbl Pegawai" =======

function testProfilPegawai() {
  Logger.log('========== testProfilPegawai() MULAI ==========');

  // --- Tbl Pegawai ---
  var pegawaiRows;
  try {
    pegawaiRows = readSheetAsObjects_(CONFIG.SHEET_PEGAWAI);
    Logger.log('[OK] Sheet "' + CONFIG.SHEET_PEGAWAI + '" ditemukan. Jumlah baris data: ' + pegawaiRows.length);
  } catch (e) {
    Logger.log('[GAGAL] Tidak bisa baca sheet "' + CONFIG.SHEET_PEGAWAI + '": ' + e.message);
    Logger.log('-> Kemungkinan besar "Tbl Pegawai" belum pernah di-generate. Coba jalankan menu "Update Tabel Pegawai" di web app, atau fungsi rebuildTblPegawai() di editor ini.');
    return;
  }
  if (!pegawaiRows.length) {
    Logger.log('[PERINGATAN] "Tbl Pegawai" ada tapi KOSONG (0 baris data).');
    Logger.log('-> Klik "Update Tabel Pegawai" di web app dulu (atau jalankan rebuildTblPegawai() di sini), baru lanjut tes ini lagi.');
    return;
  }

  // --- Tbl Profil ---
  var profilHeaders, profilRows;
  try {
    profilHeaders = getSheetHeaders_(CONFIG.SHEET_PROFIL);
    profilRows = readSheetAsObjects_(CONFIG.SHEET_PROFIL);
    Logger.log('[OK] Sheet "' + CONFIG.SHEET_PROFIL + '" ditemukan. Jumlah baris data: ' + profilRows.length);
  } catch (e) {
    Logger.log('[GAGAL] Tidak bisa baca sheet "' + CONFIG.SHEET_PROFIL + '": ' + e.message);
    Logger.log('-> Sheet "Tbl Profil" sepertinya belum ada / namanya beda. Cek nama sheet persis di spreadsheet.');
    return;
  }

  // Header Tbl Profil apa adanya vs konstanta HEADERS.PROFIL di Code.gs
  Logger.log('--- Header "Tbl Profil" (baris 1, apa adanya di sheet) ---');
  Logger.log(JSON.stringify(profilHeaders));
  var missingFromSheet = HEADERS.PROFIL.filter(function (h) { return profilHeaders.indexOf(h) === -1; });
  if (missingFromSheet.length) {
    Logger.log('[PERINGATAN] Kolom yang DIHARAPKAN script (HEADERS.PROFIL) tapi TIDAK ADA di header sheet Tbl Profil: ' + JSON.stringify(missingFromSheet));
    Logger.log('-> Field ini akan selalu kosong/undefined di halaman Profil. Cek formula QUERY di Tbl Profil, sudah mencakup kolom ini dari Tbl Pegawai atau belum.');
  } else {
    Logger.log('[OK] Semua kolom di HEADERS.PROFIL ada di header sheet Tbl Profil.');
  }

  if (!profilRows.length) {
    Logger.log('[GAGAL/PENYEBAB UTAMA] "Tbl Profil" ADA tapi 0 baris data, padahal "Tbl Pegawai" punya ' + pegawaiRows.length + ' baris.');
    Logger.log('-> Ini kemungkinan besar akar masalah "Lihat"/klik nama gagal: formula QUERY di sel A2 (atau A1) sheet Tbl Profil kosong/error/rangenya salah. Buka sheet Tbl Profil langsung di spreadsheet dan lihat apakah selnya menampilkan data, kosong, atau #REF!/#N/A/#ERROR!.');
    return;
  }

  // Cek 1 baris pertama, apakah isinya formula error (#REF!, #N/A, dst)
  var firstRow = profilRows[0];
  var firstRowStr = JSON.stringify(firstRow);
  if (/#REF!|#N\/A|#ERROR!|#VALUE!|#NAME\?/.test(firstRowStr)) {
    Logger.log('[GAGAL] Baris pertama Tbl Profil mengandung nilai error formula: ' + firstRowStr);
    Logger.log('-> Perbaiki formula QUERY di sheet Tbl Profil langsung di spreadsheet.');
    return;
  }
  Logger.log('--- Contoh baris pertama Tbl Profil ---');
  Logger.log(firstRowStr);

  // Cross-check: ID mana di Tbl Pegawai yang TIDAK ketemu di Tbl Profil
  var profilIdSet = {};
  profilRows.forEach(function (r) { profilIdSet[normalizeId_(getKeyValue_(r))] = true; });

  var missingIds = pegawaiRows
    .map(function (r) { return getKeyValue_(r); })
    .filter(function (id) { return !profilIdSet[normalizeId_(id)]; });

  Logger.log('--- Cross-check ID ABSEN: Tbl Pegawai (' + pegawaiRows.length + ' baris) vs Tbl Profil (' + profilRows.length + ' baris) ---');
  if (missingIds.length) {
    Logger.log('[GAGAL/PENYEBAB UTAMA] Ada ' + missingIds.length + ' ID ABSEN yang ada di Tbl Pegawai TAPI TIDAK MUNCUL di Tbl Profil (contoh 10 pertama): ' + JSON.stringify(missingIds.slice(0, 10)));
    Logger.log('-> Pegawai dengan ID di atas akan selalu gagal dibuka ("tidak ditemukan") walau ada di Tbl Pegawai. Cek range formula QUERY di Tbl Profil (mungkin rangenya tidak sampai baris terakhir Tbl Pegawai, atau ada filter WHERE yang keliru).');
  } else {
    Logger.log('[OK] Semua ID ABSEN di Tbl Pegawai ditemukan juga di Tbl Profil. Sinkronisasi kedua sheet ini SEHAT.');
  }

  Logger.log('========== testProfilPegawai() SELESAI ==========');
}

// ====== 2. TES END-TO-END getPegawaiDetail() UNTUK 1 PEGAWAI ======

function testDetailPegawai() {
  Logger.log('========== testDetailPegawai() MULAI ==========');

  var idToTest = TEST_ID_ABSEN_OVERRIDE;
  if (!idToTest) {
    // [DIPERBAIKI] Ambil sample dari Tbl Pegawai (bukan Tbl Bio) --
    // ini SUMBER YANG SAMA PERSIS dipakai daftar "Data Pegawai" di web
    // app (lihat getPegawaiRingkas() di Code.gs). Kalau sample diambil
    // dari Tbl Bio, bisa saja pegawai itu belum "Aktif"/belum masuk
    // Tbl Pegawai -- yang berarti dia bahkan tidak akan pernah muncul
    // untuk diklik di daftar web app, jadi tidak mewakili masalah asli.
    var pegawaiList = readSheetAsObjects_(CONFIG.SHEET_PEGAWAI);
    if (!pegawaiList.length) {
      Logger.log('[GAGAL] "Tbl Pegawai" kosong, tidak ada ID Absen yang bisa dites otomatis. Isi TEST_ID_ABSEN_OVERRIDE manual di atas file ini.');
      return;
    }
    idToTest = getKeyValue_(pegawaiList[0]);
    Logger.log('TEST_ID_ABSEN_OVERRIDE kosong -> otomatis pakai ID Absen PERTAMA dari Tbl Pegawai (sama seperti daftar Data Pegawai di web app): "' + idToTest + '" (Nama: ' + pegawaiList[0]['NAMA'] + ')');
  } else {
    Logger.log('Menguji ID Absen dari TEST_ID_ABSEN_OVERRIDE: "' + idToTest + '"');
  }

  // 1) Pastikan ID ini memang ada di Tbl Bio (sumber data paling dasar)
  var idNorm = normalizeId_(idToTest);
  var bioMatch = readSheetAsObjects_(CONFIG.SHEET_BIO)
    .find(function (r) { return normalizeId_(getKeyValue_(r)) === idNorm; });
  Logger.log('--- Cek di Tbl Bio ---');
  Logger.log(bioMatch ? ('[OK] Ditemukan. NAMA: ' + bioMatch['NAMA']) : '[GAGAL] ID ini TIDAK ada di Tbl Bio sama sekali -- typo ID, atau memang belum pernah disimpan.');

  // 2) Pastikan ID ini ada di Tbl Pegawai (hasil rebuild)
  var pegawaiMatch = readSheetAsObjects_(CONFIG.SHEET_PEGAWAI)
    .find(function (r) { return normalizeId_(getKeyValue_(r)) === idNorm; });
  Logger.log('--- Cek di Tbl Pegawai ---');
  if (pegawaiMatch) {
    Logger.log('[OK] Ditemukan di Tbl Pegawai.');
  } else {
    Logger.log('[GAGAL] ID ini TIDAK ada di Tbl Pegawai.');
    Logger.log('-> Kemungkinan: (a) belum klik "Update Tabel Pegawai" sejak pegawai ini disimpan/diberi riwayat, ATAU (b) pegawai ini tidak punya riwayat STATUS PEGAWAI = "Aktif" di Tbl Rwyt Status (syarat wajib supaya masuk Tbl Pegawai), ATAU (c) status terisi tapi typo (mis. "aktif " ada spasi, beda dari "Aktif").');
  }

  // 3) Panggil langsung fungsi yang sama persis dipakai web app
  Logger.log('--- Panggil getPegawaiDetail("' + idToTest + '") langsung ---');
  var detail;
  try {
    var raw = getPegawaiDetail(idToTest);
    // [FIX] getPegawaiDetail() sekarang return STRING JSON (lihat
    // catatan di Code.gs) supaya lolos dari bug serializer
    // google.script.run -- perlu di-parse manual di sini juga.
    detail = raw ? JSON.parse(raw) : null;
  } catch (e) {
    Logger.log('[GAGAL - ERROR/EXCEPTION] getPegawaiDetail() melempar error: ' + e.message);
    Logger.log(e.stack);
    return;
  }

  if (!detail) {
    Logger.log('[GAGAL] getPegawaiDetail() mengembalikan null -- inilah penyebab pesan "Pegawai tidak ditemukan" di web app.');
    Logger.log('-> Ini SELALU berarti ID ini tidak ketemu di Tbl Profil (lihat cek Tbl Bio/Tbl Pegawai di atas untuk tahu di tahap mana datanya putus). Jalankan juga testProfilPegawai() untuk cek kesehatan Tbl Profil secara umum.');
    return;
  }

  Logger.log('[OK] getPegawaiDetail() BERHASIL mengembalikan data.');
  Logger.log('--- detail.profil ---');
  Logger.log(JSON.stringify(detail.profil, null, 2));
  Logger.log('--- Jumlah baris riwayat per jenis ---');
  Logger.log('status: ' + detail.status.length + ', pend: ' + detail.pend.length +
    ', pangkat: ' + detail.pangkat.length + ', t4tugas: ' + detail.t4tugas.length +
    ', sipstr: ' + detail.sipstr.length);

  Logger.log('KESIMPULAN: Backend (getPegawaiDetail) BEKERJA NORMAL untuk ID ini.');
  Logger.log('Kalau tombol "Lihat"/klik nama di web app MASIH gagal untuk ID yang sama, masalahnya ADA DI FRONTEND (JavaScript.html) -- cek Console browser (F12) saat klik tombol tsb untuk lihat error JS-nya.');
  Logger.log('========== testDetailPegawai() SELESAI ==========');
}

// ====== 3. TES BANYAK PEGAWAI SEKALIGUS (bukan cuma 1 sample) ======
//
// Jalankan ini kalau mau tahu apakah masalahnya MENYELURUH (banyak/
// semua pegawai gagal dibuka) atau cuma sebagian kecil. Mengetes N
// pegawai pertama dari Tbl Pegawai (sumber daftar Data Pegawai di web
// app) dan melaporkan mana saja yang gagal.
function testDetailPegawaiBanyak() {
  var JUMLAH_SAMPLE = 20; // ubah sesuai kebutuhan
  Logger.log('========== testDetailPegawaiBanyak() MULAI (sample ' + JUMLAH_SAMPLE + ' pegawai) ==========');

  var pegawaiList = readSheetAsObjects_(CONFIG.SHEET_PEGAWAI).slice(0, JUMLAH_SAMPLE);
  if (!pegawaiList.length) {
    Logger.log('[GAGAL] "Tbl Pegawai" kosong.');
    return;
  }

  var okCount = 0, failList = [];
  pegawaiList.forEach(function (row) {
    var id = getKeyValue_(row);
    var nama = row['NAMA'];
    try {
      var raw = getPegawaiDetail(id);
      // [FIX] getPegawaiDetail() sekarang return STRING JSON -- parse dulu.
      var detail = raw ? JSON.parse(raw) : null;
      if (detail && detail.profil) {
        okCount++;
      } else {
        failList.push({ id: id, nama: nama, reason: 'getPegawaiDetail() null' });
      }
    } catch (e) {
      failList.push({ id: id, nama: nama, reason: 'ERROR: ' + e.message });
    }
  });

  Logger.log('--- HASIL: ' + okCount + ' dari ' + pegawaiList.length + ' pegawai BERHASIL dibuka ---');
  if (failList.length) {
    Logger.log('[GAGAL] ' + failList.length + ' pegawai berikut GAGAL dibuka:');
    Logger.log(JSON.stringify(failList, null, 2));
  } else {
    Logger.log('[OK] SEMUA sample berhasil dibuka lewat getPegawaiDetail(). Backend sehat untuk sample ini -> masalah kemungkinan besar di FRONTEND (cek Console browser F12 saat klik "Lihat"/nama).');
  }
  Logger.log('========== testDetailPegawaiBanyak() SELESAI ==========');
}