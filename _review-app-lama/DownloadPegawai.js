/*************************************************************
 * SIMPEG RS - Modul Download Tabel Pegawai (Excel / PDF / CSV)
 *
 * File TERPISAH dari Code.gs. Di Google Apps Script, semua file
 * .gs dalam SATU project otomatis berbagi scope global yang sama
 * -- jadi file ini bebas memakai konstanta & helper yang sudah
 * ada di Code.gs (CONFIG, sheet_(), getSheetHeaders_(), dst) tanpa
 * perlu import apa pun. Cukup taruh file ini di project Apps
 * Script yang sama dengan Code.gs, JavaScript.html, Index.html,
 * dan Stylesheet.html.
 *
 * ALUR:
 *   1) Frontend memanggil getPegawaiExportColumns() untuk
 *      menampilkan checklist semua kolom yang ada di "Tbl Pegawai".
 *   2) User memilih kolom mana saja + format file (xlsx/pdf/csv),
 *      lalu frontend memanggil exportTblPegawai(payload).
 *   3) Fungsi ini membaca "Tbl Pegawai", menyaring HANYA kolom
 *      terpilih (sesuai urutan pilihan user), lalu mem-build file
 *      dan mengembalikannya sebagai base64 -- karena HtmlService
 *      Apps Script tidak bisa langsung mengirim file untuk
 *      didownload browser, base64 inilah yang diubah jadi Blob +
 *      link download di sisi client (lihat triggerBase64Download()
 *      di JavaScript.html).
 *
 * CATATAN IZIN: fungsi export xlsx/pdf membuat 1 spreadsheet
 * SEMENTARA di Drive (untuk memakai endpoint export bawaan Google
 * Sheets), lalu langsung menghapusnya (setTrashed(true)) begitu
 * file hasil export sudah diambil -- baik proses sukses maupun
 * gagal (lihat blok finally). Saat pertama kali dipakai, Apps
 * Script akan minta izin tambahan (Drive & permintaan eksternal)
 * -- ini normal, cukup di-Allow sekali oleh user yang login.
 *************************************************************/

// ====== 1. DAFTAR KOLOM UNTUK UI PEMILIHAN ========================

// Ambil header ASLI baris 1 "Tbl Pegawai" (bukan dari konstanta
// HEADERS.PEGAWAI di Code.gs), supaya checklist di UI selalu sinkron
// persis dengan kolom yang benar-benar ada di sheet saat ini.
function getPegawaiExportColumns() {
  var headers = getSheetHeaders_(CONFIG.SHEET_PEGAWAI)
    .filter(function (h) { return !!h; });
  if (!headers.length) {
    throw new Error('"Tbl Pegawai" belum punya kolom/header. Jalankan "Update Tabel Pegawai" terlebih dahulu.');
  }
  return headers;
}

// ====== 2. ENTRY POINT UTAMA (dipanggil dari tombol Download) =====
//
// payload = {
//   columns: ['ID ABSEN','NAMA', ...],     // wajib, minimal 1 kolom,
//                                          // URUTAN sesuai pilihan user
//   format:  'xlsx' | 'pdf' | 'csv',       // wajib
//   orientation: 'landscape' | 'portrait'  // opsional, khusus pdf
//                                          // (default landscape)
// }
// return = { fileName, mimeType, base64 }
function exportTblPegawai(payload) {
  if (!payload || !payload.columns || !payload.columns.length) {
    throw new Error('Pilih minimal satu kolom untuk didownload.');
  }
  var format = String(payload.format || 'xlsx').toLowerCase();
  if (['xlsx', 'pdf', 'csv'].indexOf(format) === -1) {
    throw new Error('Format tidak dikenal: ' + format);
  }

  var table = buildFilteredPegawaiTable_(payload.columns);
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'GMT+7', 'yyyyMMdd_HHmm');
  var baseName = 'Tbl Pegawai - ' + stamp;

  if (format === 'csv') {
    return buildCsvExport_(table, baseName);
  }
  return buildSpreadsheetExport_(table, baseName, format, payload.orientation);
}

// ====== 3. AMBIL & SARING DATA SESUAI KOLOM TERPILIH ===============

function buildFilteredPegawaiTable_(selectedColumns) {
  var sh = sheet_(CONFIG.SHEET_PEGAWAI);
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) {
    throw new Error('"Tbl Pegawai" masih kosong. Jalankan "Update Tabel Pegawai" terlebih dahulu.');
  }

  var actualHeaders = getSheetHeaders_(CONFIG.SHEET_PEGAWAI);

  // Urutan kolom pada file HASIL DOWNLOAD mengikuti urutan pilihan user
  // (bukan urutan asli sheet), supaya user bebas menyusun tampilan.
  var colIndexes = selectedColumns.map(function (col) {
    var idx = actualHeaders.indexOf(col);
    if (idx === -1) {
      throw new Error('Kolom "' + col + '" tidak ditemukan di Tbl Pegawai.');
    }
    return idx;
  });

  var rawValues = (lastRow > 1)
    ? sh.getRange(2, 1, lastRow - 1, lastCol).getValues()
    : [];

  var tz = Session.getScriptTimeZone() || 'GMT+7';
  var rows = [];
  rawValues.forEach(function (r) {
    var isEmpty = r.every(function (v) { return v === '' || v === null; });
    if (isEmpty) return; // lewati baris kosong total
    rows.push(colIndexes.map(function (ci) {
      var v = r[ci];
      // Rapikan nilai Date supaya tampil dd/mm/yyyy, bukan format
      // Date mentah/serial number saat masuk file Excel/PDF/CSV.
      if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
        return Utilities.formatDate(v, tz, 'dd/MM/yyyy');
      }
      return v;
    }));
  });

  return { headers: selectedColumns, rows: rows };
}

// ====== 4. EXPORT CSV (ringan, tanpa file Drive sementara) =========

function buildCsvExport_(table, baseName) {
  function esc(v) {
    var s = (v === null || v === undefined) ? '' : String(v);
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  var lines = [];
  lines.push(table.headers.map(esc).join(','));
  table.rows.forEach(function (r) { lines.push(r.map(esc).join(',')); });
  var csv = lines.join('\r\n');

  // Tambahkan BOM UTF-8 supaya karakter non-ASCII & Excel tetap rapi
  // saat file CSV dibuka langsung (bukan lewat import khusus).
  var bodyBytes = Utilities.newBlob(csv, 'text/csv').getBytes();
  var bom = [0xEF, 0xBB, 0xBF];
  var withBom = bom.concat(bodyBytes);
  var blob = Utilities.newBlob(withBom, 'text/csv', baseName + '.csv');

  return {
    fileName: baseName + '.csv',
    mimeType: 'text/csv',
    base64: Utilities.base64Encode(blob.getBytes())
  };
}

// ====== 5. EXPORT XLSX / PDF (via spreadsheet sementara) ===========
//
// Apps Script tidak punya cara langsung "menulis" file .xlsx/.pdf dari
// array data. Caranya: buat 1 Google Spreadsheet SEMENTARA berisi data
// yang sudah difilter, lalu pakai endpoint export bawaan Google Sheets
// (.../export?format=xlsx atau format=pdf) lewat UrlFetchApp memakai
// token OAuth milik user yang sedang login. Spreadsheet sementara ini
// SELALU dihapus di blok finally (baik sukses maupun gagal) supaya
// tidak menumpuk file "Tbl Pegawai - ..." di Drive user tiap download.
function buildSpreadsheetExport_(table, baseName, format, orientation) {
  var tempSs = SpreadsheetApp.create(baseName);
  var tempId = tempSs.getId();
  try {
    var sh = tempSs.getSheets()[0];
    sh.setName('Tbl Pegawai');

    var allRows = [table.headers].concat(table.rows);
    if (allRows.length && table.headers.length) {
      sh.getRange(1, 1, allRows.length, table.headers.length).setValues(allRows);
    }

    // Rapikan tampilan: header tebal + warna + freeze baris 1 + lebar
    // kolom otomatis, supaya hasil Excel/PDF enak dilihat.
    sh.getRange(1, 1, 1, table.headers.length)
      .setFontWeight('bold')
      .setBackground('#e3f5f2');
    sh.setFrozenRows(1);
    for (var c = 1; c <= table.headers.length; c++) {
      sh.autoResizeColumn(c);
    }
    SpreadsheetApp.flush();

    var blob;
    if (format === 'xlsx') {
      var xlsxUrl = 'https://docs.google.com/spreadsheets/d/' + tempId + '/export?format=xlsx';
      blob = fetchExportBlob_(xlsxUrl, baseName + '.xlsx');
    } else {
      var isPortrait = (orientation === 'portrait');
      var pdfUrl = 'https://docs.google.com/spreadsheets/d/' + tempId + '/export' +
        '?format=pdf&size=A4' +
        '&portrait=' + isPortrait +
        '&fitw=true&scale=4' +          // fitw + scale=4 (Fit to width) supaya kolom banyak tetap muat 1 halaman lebar
        '&sheetnames=false&printtitle=false' +
        '&pagenumbers=true&gridlines=true&fzr=true' +
        '&gid=' + sh.getSheetId();
      blob = fetchExportBlob_(pdfUrl, baseName + '.pdf');
    }

    return {
      fileName: blob.getName(),
      mimeType: blob.getContentType(),
      base64: Utilities.base64Encode(blob.getBytes())
    };
  } finally {
    // Hapus (pindah ke Trash) spreadsheet sementara, bukan hanya
    // ditinggal di My Drive milik user.
    try { DriveApp.getFileById(tempId).setTrashed(true); } catch (e) { /* diamkan */ }
  }
}

function fetchExportBlob_(url, fileName) {
  var token = ScriptApp.getOAuthToken();
  var resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Gagal membuat file export (kode ' + resp.getResponseCode() + '). Coba lagi.');
  }
  return resp.getBlob().setName(fileName);
}