/*************************************************************
 * SIMPEG RS - Modul Download Pegawai Lanjutan (Filter Status + Tanggal)
 *
 * File TERPISAH dari Code.gs DAN dari DownloadPegawai.gs (yang sudah
 * ada sebelumnya, download apa adanya dari "Tbl Pegawai" tanpa
 * filter). Satu project Apps Script -> bebas memakai semua konstanta
 * & helper Code.gs (CONFIG, HEADERS, STATIC_OPTIONS, readSheetAsObjects_(),
 * getKeyValue_(), normalizeId_(), parseDateFlexible_(), latestByDate_(),
 * getReffOptions_()) DAN fungsi buildCsvExport_()/buildSpreadsheetExport_()
 * dari DownloadPegawai.gs (supaya format file Excel/PDF/CSV-nya
 * konsisten, tidak duplikasi logic).
 *
 * BEDA dengan DownloadPegawai.gs:
 *   - DownloadPegawai.gs  -> sumber "Tbl Pegawai" (HANYA yang Aktif,
 *                            hasil rebuild), tanpa filter apa pun.
 *   - Modul ini            -> sumber "Tbl Bio" + "Tbl Rwyt Status"
 *                            LANGSUNG (SEMUA pegawai, termasuk
 *                            Non-Aktif/Pensiun/dll), dengan filter
 *                            Status & rentang tanggal TMT status
 *                            terakhir sebelum di-export.
 *
 * ALUR:
 *   1) getFilterDownloadMeta() -> kolom yang bisa dipilih + daftar
 *      opsi Status (utk checklist & dropdown filter di UI).
 *   2) exportPegawaiFilterAdvanced(payload) -> gabungkan Tbl Bio +
 *      Status TERBARU per pegawai, filter sesuai kriteria, saring
 *      kolom terpilih, lalu generate file (reuse builder yang sama
 *      dengan DownloadPegawai.gs).
 *************************************************************/

// ====== 1. METADATA UNTUK UI (kolom + opsi status) ==================

// Dikembalikan sebagai 1 object gabungan (bukan 2 call terpisah)
// supaya UI cukup 1x round-trip ke server.
function getFilterDownloadMeta() {
  // Kolom = gabungan field Biodata + field Status (tanpa duplikat
  // ID ABSEN/NAMA), urutan Biodata dulu baru Status.
  var statusOnly = HEADERS.STATUS.filter(function (h) {
    return h !== 'ID ABSEN' && h !== 'NAMA';
  });
  var columns = HEADERS.BIO.concat(statusOnly);

  var statusOptions = getReffOptions_('STATUS PEGAWAI');
  if (!statusOptions.length) statusOptions = STATIC_OPTIONS['STATUS PEGAWAI'] || [];

  return { columns: columns, statusOptions: statusOptions };
}

// ====== 2. GABUNGKAN Tbl Bio + STATUS TERBARU PER PEGAWAI ===========

function buildBioStatusGabungan_() {
  var bioList = readSheetAsObjects_(CONFIG.SHEET_BIO);
  var statusList = readSheetAsObjects_(CONFIG.SHEET_STATUS);

  var statusByID = {};
  statusList.forEach(function (r) {
    var id = normalizeId_(getKeyValue_(r));
    if (!statusByID[id]) statusByID[id] = [];
    statusByID[id].push(r);
  });

  return bioList.map(function (bio) {
    var id = normalizeId_(getKeyValue_(bio));
    var latestStatus = latestByDate_(statusByID[id] || [], 'TMT STATUS PEG');
    var merged = {};
    HEADERS.BIO.forEach(function (h) { merged[h] = bio[h]; });
    if (latestStatus) {
      HEADERS.STATUS.forEach(function (h) {
        if (h === 'ID ABSEN' || h === 'NAMA') return;
        merged[h] = latestStatus[h];
      });
    }
    return merged;
  });
}

// ====== 3. ENTRY POINT UTAMA (dipanggil dari tombol Download) =======
//
// payload = {
//   columns: [...],            // wajib, minimal 1, urutan sesuai pilihan user
//   format: 'xlsx'|'pdf'|'csv',// wajib
//   statuses: ['Aktif', ...],  // opsional -- kosong/absen = semua status
//   tglAkhir: 'yyyy-mm-dd',    // opsional -- filter TMT STATUS PEG <= tanggal ini
//   orientation: 'landscape'|'portrait' // opsional, khusus pdf
// }
function exportPegawaiFilterAdvanced(payload) {
  if (!payload || !payload.columns || !payload.columns.length) {
    throw new Error('Pilih minimal satu kolom untuk didownload.');
  }
  var format = String(payload.format || 'xlsx').toLowerCase();
  if (['xlsx', 'pdf', 'csv'].indexOf(format) === -1) {
    throw new Error('Format tidak dikenal: ' + format);
  }

  var statusFilter = (payload.statuses && payload.statuses.length) ? payload.statuses : null;
  var tglAkhir = payload.tglAkhir ? parseDateFlexible_(payload.tglAkhir) : null;

  var gabungan = buildBioStatusGabungan_();

  var filtered = gabungan.filter(function (r) {
    if (statusFilter && statusFilter.indexOf(r['STATUS PEGAWAI']) === -1) return false;

    if (tglAkhir) {
      var d = parseDateFlexible_(r['TMT STATUS PEG']);
      if (!d) return false; // tidak punya tanggal -> tidak bisa dicocokkan filter "sampai"
      if (d > tglAkhir) return false; // WAJIB <= tanggal "Sampai"
    }
    return true;
  });

  if (!filtered.length) {
    throw new Error('Tidak ada pegawai yang cocok dengan filter yang dipilih.');
  }

  // Susun tabel HANYA kolom terpilih, urutan sesuai pilihan user, dan
  // rapikan nilai Date jadi string dd/mm/yyyy (konsisten dgn DownloadPegawai.gs).
  var tz = Session.getScriptTimeZone() || 'GMT+7';
  var rows = filtered.map(function (r) {
    return payload.columns.map(function (col) {
      var v = r[col];
      if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
        return Utilities.formatDate(v, tz, 'dd/MM/yyyy');
      }
      return v;
    });
  });

  var table = { headers: payload.columns, rows: rows };
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'GMT+7', 'yyyyMMdd_HHmm');
  var baseName = 'Data Pegawai (Filter) - ' + stamp;

  // [PENTING] Reuse builder yang SAMA dengan DownloadPegawai.gs supaya
  // format Excel/PDF/CSV konsisten & tidak duplikasi kode.
  if (format === 'csv') {
    return buildCsvExport_(table, baseName);
  }
  return buildSpreadsheetExport_(table, baseName, format, payload.orientation);
}