/*************************************************************
 * SIMPEG RS - Modul DMS (Dokumen Manajemen Sistem) Sederhana
 *
 * File TERPISAH dari Code.gs, satu project -> bebas memakai
 * konstanta & helper Code.gs (CONFIG, readSheetAsObjects_(),
 * ensureSheet_(), sheet_(), getKeyValue_(), normalizeId_(),
 * appendRowByHeaders_(), withLock_()) tanpa import apa pun.
 *
 * ALUR SEDERHANA (sesuai permintaan):
 *   - 1 pegawai = 1 file PDF (berisi seluruh dokumen kepegawaiannya
 *     digabung jadi satu), BUKAN banyak dokumen per jenis.
 *   - Sheet "Tbl Dokumen" HANYA 2 kolom: ID ABSEN | LINK DOKUMEN.
 *   - Upload lewat app -> file disimpan di folder Drive (link yang
 *     dikasih user), lalu ID ABSEN + LINK DOKUMEN dicatat/di-update
 *     di "Tbl Dokumen" (upsert -- upload ulang MENGGANTI baris lama,
 *     bukan menambah baris baru, karena cuma 1 file per pegawai).
 *   - Baris yang SUDAH ADA sebelumnya di "Tbl Dokumen" (diisi manual
 *     oleh user dgn link Drive yang sudah ada) ikut kebaca apa
 *     adanya oleh getDokumenPegawai() -- tidak perlu upload ulang
 *     lewat app supaya bisa dipreview/download.
 *   - Preview & download dibaca dari LINK DOKUMEN tsb (ekstrak file
 *     ID dari berbagai format link share Drive yang umum).
 *************************************************************/

var CONFIG_DMS = {
  ROOT_FOLDER_ID: '1FpbPquPF9SIFsOeRwj4A5ZOT8zdMKk_N',
  SHEET_DOKUMEN: 'Tbl Dokumen',
  HEADERS: ['ID ABSEN', 'LINK DOKUMEN'],
  MAX_FILE_MB: 15
};

// ====== 1. EKSTRAK FILE ID DARI LINK DRIVE (berbagai format) ========

function extractDriveFileId_(url) {
  if (!url) return '';
  var s = String(url).trim();
  var m = s.match(/\/d\/([a-zA-Z0-9_-]+)/) || s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return (m && m[1]) ? m[1] : '';
}

function buildDokumenLinks_(rawLink) {
  var fileId = extractDriveFileId_(rawLink);
  if (fileId) {
    return {
      linkDokumen: rawLink,
      previewUrl: 'https://drive.google.com/file/d/' + fileId + '/preview',
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + fileId
    };
  }
  // Bukan format link Drive yang dikenali (mis. link penyimpanan lain
  // yang ditulis manual) -- pakai apa adanya utk preview & download.
  return { linkDokumen: rawLink, previewUrl: rawLink, downloadUrl: rawLink };
}

// ====== 2. AMBIL DOKUMEN 1 PEGAWAI (dipanggil dari frontend) =========

function getDokumenPegawai(idAbsen) {
  var idNorm = normalizeId_(idAbsen);
  var row = readSheetAsObjects_(CONFIG_DMS.SHEET_DOKUMEN)
    .find(function (r) { return normalizeId_(getKeyValue_(r)) === idNorm; });

  var result = (row && row['LINK DOKUMEN']) ? buildDokumenLinks_(row['LINK DOKUMEN']) : null;

  // [FIX] Serialize manual -- sama seperti getPegawaiDetail()/
  // getNotifikasiList() sebelumnya, jaga-jaga dari bug serializer
  // google.script.run. Client WAJIB JSON.parse() hasilnya.
  return JSON.stringify(result);
}

// ====== 3. UPLOAD / GANTI DOKUMEN (upsert -- 1 pegawai = 1 file) ====

function uploadDokumenPegawai(idAbsen, fileBase64) {
  return withLock_(function () {
    var id = String(idAbsen || '').trim();
    if (!id) throw new Error('Pilih pegawai terlebih dahulu.');
    if (!fileBase64) throw new Error('File tidak ditemukan.');

    var approxMb = (fileBase64.length * 0.75) / (1024 * 1024);
    if (approxMb > CONFIG_DMS.MAX_FILE_MB) {
      throw new Error('Ukuran file terlalu besar (maks ' + CONFIG_DMS.MAX_FILE_MB + ' MB).');
    }

    var idNorm = normalizeId_(id);
    var bio = readSheetAsObjects_(CONFIG.SHEET_BIO)
      .find(function (r) { return normalizeId_(getKeyValue_(r)) === idNorm; });
    if (!bio) throw new Error('Pegawai dengan ID Absen "' + id + '" tidak ditemukan.');

    var sh = ensureSheet_(CONFIG_DMS.SHEET_DOKUMEN, CONFIG_DMS.HEADERS);

    // Cari baris existing utk ID ini -- kalau ada, file lama dihapus dari
    // Drive dulu (supaya tidak menumpuk file usang) & barisnya di-UPDATE,
    // bukan ditambah baris baru (1 pegawai = 1 file aktif).
    var existingRowIndex = -1;
    var lastRow = sh.getLastRow();
    if (lastRow >= 2) {
      var data = sh.getRange(2, 1, lastRow - 1, CONFIG_DMS.HEADERS.length).getValues();
      for (var i = 0; i < data.length; i++) {
        if (normalizeId_(data[i][0]) === idNorm) { existingRowIndex = i; break; }
      }
      if (existingRowIndex > -1) {
        var oldFileId = extractDriveFileId_(data[existingRowIndex][1]);
        if (oldFileId) {
          try { DriveApp.getFileById(oldFileId).setTrashed(true); } catch (e) { /* file lama sudah tidak ada, lanjutkan */ }
        }
      }
    }

    var root = DriveApp.getFolderById(CONFIG_DMS.ROOT_FOLDER_ID);
    var namaFile = id + ' - ' + bio['NAMA'] + '.pdf';
    var bytes = Utilities.base64Decode(fileBase64);
    var blob = Utilities.newBlob(bytes, 'application/pdf', namaFile);
    var file = root.createFile(blob);

    // Supaya bisa langsung dipreview/download dari web app tanpa login.
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var link = file.getUrl();

    if (existingRowIndex > -1) {
      sh.getRange(existingRowIndex + 2, 2).setValue(link); // update kolom LINK DOKUMEN
    } else {
      appendRowByHeaders_(sh, { 'ID ABSEN': id, 'LINK DOKUMEN': link });
    }

    return { ok: true, link: link };
  });
}

// ====== 4. HAPUS DOKUMEN 1 PEGAWAI ====================================

function deleteDokumenPegawai(idAbsen) {
  return withLock_(function () {
    var idNorm = normalizeId_(idAbsen);
    var sh = sheet_(CONFIG_DMS.SHEET_DOKUMEN);
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return { ok: true };

    var data = sh.getRange(2, 1, lastRow - 1, CONFIG_DMS.HEADERS.length).getValues();
    for (var i = 0; i < data.length; i++) {
      if (normalizeId_(data[i][0]) === idNorm) {
        var fileId = extractDriveFileId_(data[i][1]);
        if (fileId) {
          try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* abaikan */ }
        }
        sh.deleteRow(i + 2);
        break;
      }
    }
    return { ok: true };
  });
}