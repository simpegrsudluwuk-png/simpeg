/*************************************************************
 * SIMPEG RS - Sistem Informasi Manajemen Kepegawaian RS
 * Backend Google Apps Script
 *
 * Struktur Spreadsheet yang dipakai (SEMUA nama sheet & header
 * di bawah ini WAJIB sama persis dengan sheet aslinya):
 *   - Tbl Bio            : data biodata statis pegawai (1 baris / pegawai)
 *   - Tbl Rwyt Status    : riwayat status kepegawaian (banyak baris / pegawai)
 *   - Tbl Rwyt Pend      : riwayat pendidikan
 *   - Tbl Rwyt Pangkat   : riwayat pangkat/golongan/jabatan
 *   - Tbl Rwyt T4 Tugas  : riwayat tempat tugas/unit kerja
 *   - Tbl Reff           : tabel referensi (dropdown & lookup)
 *   - Tbl Pegawai        : (DIBUAT/DITULIS OTOMATIS OLEH SCRIPT INI)
 *                          rekap pegawai AKTIF dengan data terbaru
 *
 * -------------------------------------------------------------
 * CATATAN PERBAIKAN (lihat komentar berpenanda [FIX] di bawah):
 *
 * [FIX 1] "Pegawai tidak ditemukan" padahal ada di Tbl Bio:
 *   readSheetAsObjects_() memetakan kolom berdasarkan TEKS PERSIS
 *   header baris 1 di sheet sumber (Tbl Bio dkk), sedangkan
 *   pencarian sebelumnya mengakses r[CONFIG.KEY_COL] yang PEKA
 *   besar/kecil huruf & spasi. Kalau header asli di sheet sedikit
 *   berbeda (mis. spasi ganda / kapitalisasi beda) dari konstanta
 *   'ID ABSEN', maka SEMUA baris gagal cocok -> pencarian ID apa
 *   pun selalu gagal walau datanya ada. Ditambahkan helper
 *   getKeyValue_() yang mencari kolom kunci tanpa peka huruf
 *   besar/kecil, dipakai di semua tempat yang tadinya memakai
 *   r[CONFIG.KEY_COL] langsung.
 *
 * [FIX 2] Legend "Islam" & "islam" tampil dobel di dashboard:
 *   getDashboardStats() sebelumnya mengelompokkan nilai kategori
 *   (Agama, Jenis Kelamin, dst) apa adanya, sehingga variasi
 *   kapitalisasi/spasi dianggap kategori berbeda. Ditambahkan
 *   makeCounter_() yang menggabungkan nilai secara
 *   case-insensitive & trim spasi, lalu memetakan ke label baku
 *   dari STATIC_OPTIONS bila cocok.
 *
 * [FIX 3] Pegawai baru (dari form Tambah Pegawai) tidak pernah
 *   muncul di halaman Profil / Dashboard:
 *   "Tbl Dashboard" & "Tbl Profil" adalah SHEET HASIL FORMULA
 *   =QUERY(...) dari "Tbl Pegawai" -- bukan sheet yang ditulis
 *   manual. Sementara itu rebuildTblPegawai() HANYA memasukkan
 *   pegawai yang punya riwayat "STATUS PEGAWAI" = "Aktif" di
 *   "Tbl Rwyt Status". Form Tambah Pegawai sebelumnya cuma
 *   menulis ke "Tbl Bio" saja, tidak pernah membuat baris status,
 *   sehingga pegawai baru selalu ter-skip dari "Tbl Pegawai" dan
 *   akibatnya tidak pernah muncul di "Tbl Profil"/"Tbl Dashboard".
 *   -> Ditambahkan saveNewPegawai() yang menulis Bio SEKALIGUS
 *      riwayat awal (Status wajib, Pend/Pangkat/T4 Tugas/SIP-STR
 *      opsional bila datanya tersedia) dalam satu transaksi,
 *      baru rebuild sekali di akhir.
 *
 * [FIX 4] saveProfil() akan SELALU error saat dipanggil:
 *   Karena "Tbl Profil" adalah spill range dari satu formula
 *   QUERY, Range.setValues() ke sel manapun di dalamnya akan
 *   ditolak Apps Script ("This action would remove array
 *   formula..."). Fungsi ini DIHAPUS. Sebagai gantinya, edit
 *   biodata memakai getBioByIdAbsen() (baca) + saveBio() (tulis)
 *   yang keduanya beroperasi langsung ke "Tbl Bio" (sheet asli,
 *   bukan hasil formula).
 *
 * [FIX 5] Tidak ada penguncian saat operasi tulis:
 *   Ditambahkan LockService (withLock_()) di semua fungsi yang
 *   menulis/menghapus data, supaya dua pengguna yang menyimpan
 *   hampir bersamaan tidak saling tabrakan saat rebuildTblPegawai()
 *   melakukan clearContents() + setValues() ke "Tbl Pegawai".
 *
 * [FIX 6] "Tbl Rwyt SIP-STR" tidak pernah bisa di-CRUD dari
 *   halaman Profil (RWYT_CONFIG_ sebelumnya tidak punya entri
 *   'sipstr') walau datanya tetap ikut dibaca saat rebuild.
 *   Ditambahkan entri 'sipstr' ke RWYT_CONFIG_.
 *************************************************************/

// ====== 1. KONFIGURASI ======================================

var CONFIG = {
  // Ganti jika file ini di-deploy terpisah dari spreadsheet sumber.
  // Kosongkan ('') jika Code.gs ini bound langsung ke spreadsheet SIMPEG.
  SPREADSHEET_ID: '1FufDIsnjH3wsXNKwh4PoOCUovXlJ1-IhOG0LmXLYS7A',

  SHEET_BIO: 'Tbl Bio',
  SHEET_STATUS: 'Tbl Rwyt Status',
  SHEET_PEND: 'Tbl Rwyt Pend',
  SHEET_PANGKAT: 'Tbl Rwyt Pangkat',
  SHEET_T4TUGAS: 'Tbl Rwyt T4 Tugas',
  SHEET_MASAKERJA: 'Tbl Masa Kerja',
  SHEET_SIPSTR: 'Tbl Rwyt SIP-STR',
  SHEET_KGB: 'Tbl Rwyt KGB', // [BARU] riwayat Kenaikan Gaji Berkala
  SHEET_REFF: 'Tbl Reff',
  SHEET_PEGAWAI: 'Tbl Pegawai',
  SHEET_DASHBOARD: 'Tbl Dashboard',
  SHEET_PROFIL: 'Tbl Profil', // [BARU] sumber tunggal utk halaman Profil Pegawai

  KEY_COL: 'ID ABSEN' // kolom kunci penghubung semua tabel
};

// Header persis sesuai spreadsheet sumber. Urutan HARUS sama dengan
// urutan kolom asli di sheet masing-masing (kolom A, B, C, ...).
var HEADERS = {
  // [FIX 3/4] 'LINK FOTO' dipindah jadi field resmi Tbl Bio (sumber asli
  // yang bisa ditulis), bukan lagi kolom manual di luar spill range
  // Tbl Profil. WAJIB tambahkan kolom "LINK FOTO" di sheet "Tbl Bio"
  // asli (kolom paling kanan) supaya field ini benar-benar tersimpan.
  BIO: ['ID ABSEN', 'NIK', 'NIP', 'NPWP', 'KARPEG-NAKERTRANS', 'NAMA',
        'JENIS KELAMIN', 'AGAMA', 'EMAIL', 'NOMOR HP', 'TEMPAT LAHIR',
        'KOTA TEMPAT LAHIR', 'TANGGAL LAHIR', 'LINK FOTO'],

  STATUS: ['ID ABSEN', 'NAMA', 'STATUS PEGAWAI', 'TMT STATUS PEG',
           'JENIS PEGAWAI', 'NIP', 'TMT JENIS PEGAWAI',
           'NO SURAT KEPUTUSAN', 'TMT SK'],

  PEND: ['ID ABSEN', 'NAMA', 'TINGKAT PEND', 'NAMA KAMPUS',
         'JURUSAN/PEMINATAN', 'NOMOR SK TUBEL', 'TAHUN MASUK',
         'TAHUN LULUS', 'NO IJAZAH', 'GELAR DEPAN', 'GELAR BELAKANG'],

  PANGKAT: ['ID ABSEN', 'NAMA', 'GOL', 'NAMA SK', 'NOMOR SK', 'TMT',
            'GAJI POKOK', 'JABATAN PERMENPAN', 'KELAS JABATAN',
            'NO SK FUNGSIONAL', 'TMT SK FUNGSIONAL', 'TGL SK FUNGSIONAL',
            'TUNJANGAN-PAK', 'JABATAN TPP'],

  T4TUGAS: ['ID ABSEN', 'NAMA', 'TEMPAT TUGAS', 'JABATAN',
            'TMT TEMPAT TUGAS', 'NO. SK'],

  MASAKERJA: ['ID ABSEN', 'TMT RS PERTAMA', 'TMT RS Terakhir', 'MASA KERJA'],

  SIPSTR: ['ID ABSEN', 'NAMA', 'Nomor SIP', 'TMT Terbit SIP', 'TMT Valid SIP',
           'Nomor STR', 'TMT Terbit STR', 'TMT Valid STR'],

  // [BARU] Riwayat Kenaikan Gaji Berkala (KGB). Berulang tiap 2 tahun
  // sejak "TMT KGB" sebelumnya -- lihat rebuildTblPegawai() untuk
  // logika hitung "TMT KGB BERIKUTNYA" yang dipakai modul Notifikasi.
  KGB: ['ID ABSEN', 'NAMA', 'GOL', 'NAMA SK', 'NOMOR SK', 'TMT KGB', 'GAJI BERKALA'],

  // Kolom hasil generate Tbl Pegawai
  // [PENTING] Array di bawah ini MENENTUKAN URUTAN KOLOM asli "Tbl
  // Pegawai" saat di-rebuild. Kolom "[BARU]" SELALU ditaruh PALING
  // KANAN (bukan disisip di tengah) supaya TIDAK menggeser posisi
  // kolom yang sudah ada -- kalau disisip di tengah, formula QUERY di
  // "Tbl Profil" / "Tbl Dashboard" yang mereferensikan kolom Tbl
  // Pegawai by-letter (mis. kolom AN) akan ikut bergeser & rusak.
  PEGAWAI: ['ID ABSEN', 'NIK', 'NIP', 'NPWP', 'KARPEG-NAKERTRANS', 'NAMA',
            'JENIS KELAMIN', 'AGAMA', 'EMAIL', 'NOMOR HP',
            'TEMPAT TANGGAL LAHIR', 'UMUR',
            'STATUS PEGAWAI', 'TMT STATUS PEG', 'JENIS PEGAWAI',
            'NO SURAT KEPUTUSAN STATUS', 'TMT SK STATUS',
            'TINGKAT PEND', 'NAMA KAMPUS', 'JURUSAN/PEMINATAN',
            'GELAR DEPAN', 'GELAR BELAKANG',
            'GOL', 'PANGKAT GOL.RUANG', 'JABATAN PERMENPAN',
            'KELAS JABATAN', 'TMT PANGKAT', 'GAJI POKOK', 'TPP',
            'TEMPAT TUGAS', 'JABATAN', 'TMT TEMPAT TUGAS',
            'MASA KERJA',
            'NOMOR SIP', 'TMT TERBIT SIP', 'TMT VALID SIP',
            'NOMOR STR', 'TMT TERBIT STR', 'TMT VALID STR',
            'LINK FOTO', // [FIX 3/4] ikut ditulis dari Tbl Bio saat rebuild
            'TMT KGB TERAKHIR', 'GAJI BERKALA TERAKHIR', 'TMT KGB BERIKUTNYA',
            'TMT RS PERTAMA'], // [BARU] dari Tbl Masa Kerja (kolom B) -- ditaruh paling kanan, lihat catatan di atas

  // Sheet ringkas khusus sumber data Dashboard (subset dari Tbl Pegawai)
  DASHBOARD: ['ID ABSEN', 'JENIS KELAMIN', 'AGAMA', 'UMUR', 'JENIS PEGAWAI',
              'TINGKAT PEND', 'JURUSAN/PEMINATAN', 'GOL', 'TEMPAT TUGAS', 'JABATAN'],

  // "Tbl Profil" adalah SHEET HASIL FORMULA (=QUERY dari Tbl Pegawai),
  // JADI HANYA DIBACA oleh script ini -- tidak pernah ditulis. Field
  // 'LINK FOTO' sekarang ikut lewat Tbl Bio -> Tbl Pegawai (lihat [FIX 3/4]
  // di komentar atas), sehingga formula QUERY di "Tbl Profil" perlu
  // diupdate manual di spreadsheet untuk menyertakan kolom LINK FOTO
  // yang baru di Tbl Pegawai (kolom paling kanan / AN), contoh:
  //   =QUERY('Tbl Pegawai'!A:AN;"SELECT A,B,F,O,C,D,G,H,I,J,K,L,R,S,T,X,AD,AE,AJ,AM,AN")
  PROFIL: ['ID ABSEN', 'NIK', 'NAMA', 'JENIS PEGAWAI', 'NIP', 'NPWP',
           'JENIS KELAMIN', 'AGAMA', 'EMAIL', 'NOMOR HP',
           'TEMPAT TANGGAL LAHIR', 'UMUR', 'TINGKAT PEND', 'NAMA KAMPUS',
           'JURUSAN/PEMINATAN', 'PANGKAT GOL.RUANG', 'TEMPAT TUGAS', 'JABATAN',
           'TMT VALID SIP', 'TMT VALID STR', 'LINK FOTO']
};

// Opsi dropdown statis (fallback bila tidak ditemukan di Tbl Reff)
var STATIC_OPTIONS = {
  'JENIS KELAMIN': ['Laki-laki', 'Wanita'],
  'AGAMA': ['Islam', 'Kristen Protestan', 'Kristen Katolik', 'Hindu', 'Buddha', 'Khonghucu'],
  'STATUS PEGAWAI': ['Aktif', 'Tidak Aktif', 'Pensiun', 'Berhenti', 'Meninggal Dunia', 'Mutasi Keluar'],
  'JENIS PEGAWAI': ['PNS', 'PNS Titipan', 'CPNS', 'P3K', 'P3K Titipan', 'PW', 'Honor', 'Kontrak', 'Magang'],
  'TINGKAT PEND': ['SD', 'SMP', 'SMA/SMK', 'D1', 'D2', 'D3', 'D4', 'S1', 'Profesi', 'S2', 'S3'],
  'GOL': ['I/a','I/b','I/c','I/d','II/a','II/b','II/c','II/d',
          'III/a','III/b','III/c','III/d','IV/a','IV/b','IV/c','IV/d','IV/e']
};

// Kolom-kolom yang HARUS diperlakukan sebagai tanggal (dipakai date picker)
var DATE_FIELDS = ['TANGGAL LAHIR', 'TMT STATUS PEG', 'TMT JENIS PEGAWAI',
  'TMT SK', 'TMT', 'TMT SK FUNGSIONAL', 'TGL SK FUNGSIONAL',
  'TMT TEMPAT TUGAS', 'TMT RS Terakhir',
  'TMT Terbit SIP', 'TMT Valid SIP', 'TMT Terbit STR', 'TMT Valid STR',
  'TMT VALID SIP', 'TMT VALID STR']; // [BARU] versi huruf besar dari Tbl Profil

// ====== 2. ENTRY POINT WEB APP ===============================

function doGet(e) {
  var tpl = HtmlService.createTemplateFromFile('index');
  return tpl.evaluate()
    .setTitle('SIMPEG RS')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('SIMPEG RS')
    .addItem('Buka Web App', 'showWebAppUrl_')
    .addItem('Rebuild Tbl Pegawai Sekarang', 'rebuildTblPegawai')
    .addItem('Pasang Trigger Otomatis', 'setupTriggers')
    .addToUi();
}

function showWebAppUrl_() {
  var url = ScriptApp.getService().getUrl();
  SpreadsheetApp.getUi().alert('URL Web App:\n' + (url || '(deploy dulu sebagai Web App)'));
}

function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'rebuildTblPegawaiTrigger_') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('rebuildTblPegawaiTrigger_')
    .timeBased().everyHours(1).create();
  rebuildTblPegawai();
  SpreadsheetApp.getUi().alert('Trigger otomatis terpasang (rebuild tiap 1 jam) + onEdit aktif.');
}

function rebuildTblPegawaiTrigger_() {
  rebuildTblPegawai();
  // [BARU] Nebeng trigger jam-an yang sudah ada -- lihat Notifikasi.gs.
  // rebuildTblNotifikasi() murah (baca Tbl Pegawai yang sudah kecil &
  // rapi, bukan scan mentah semua sheet riwayat). processNotifikasiHarian_()
  // (efek samping: bikin event kalender & kirim email) dijaga otomatis
  // supaya cuma jalan 1x/hari walau trigger ini jalan tiap jam.
  rebuildTblNotifikasi();
  processNotifikasiHarian_();
}

// Simple trigger bawaan spreadsheet -> auto rebuild saat sheet sumber diedit
function onEdit(e) {
  try {
    var name = e.range.getSheet().getName();
    var watched = [CONFIG.SHEET_BIO, CONFIG.SHEET_STATUS, CONFIG.SHEET_PEND,
                   CONFIG.SHEET_PANGKAT, CONFIG.SHEET_T4TUGAS];
    if (watched.indexOf(name) > -1) {
      rebuildTblPegawai();
    }
  } catch (err) {
    // diamkan supaya tidak mengganggu edit manual di sheet
  }
}

// ====== 3. HELPER SPREADSHEET / SHEET =========================

function ss_() {
  return CONFIG.SPREADSHEET_ID
    ? SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

// [FIX 5] Bungkus operasi tulis dengan LockService supaya dua eksekusi
// (dua pengguna web app yang menyimpan hampir bersamaan) tidak saling
// tabrakan, terutama saat rebuildTblPegawai() melakukan clearContents()
// + setValues() ke seluruh "Tbl Pegawai". Lock di-scope ke SCRIPT
// (dipakai bersama semua pengguna web app ini), tunggu maksimal 30 detik
// sebelum menyerah dengan pesan error yang jelas.
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  var gotLock = lock.tryLock(30000);
  if (!gotLock) {
    throw new Error('Sistem sedang sibuk memproses perubahan lain. Silakan coba lagi beberapa saat.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// Baca sheet riwayat secara aman: kalau sheet-nya belum ada / gagal
// dibaca, kembalikan array kosong alih-alih menjatuhkan seluruh proses
// (dipakai untuk sheet riwayat yang sifatnya opsional saat rebuild).
function safeReadSheet_(sheetName) {
  try {
    return readSheetAsObjects_(sheetName);
  } catch (err) {
    return [];
  }
}

// [DIPERKUAT] Cari sheet berdasarkan nama. Coba exact match dulu; jika
// gagal, coba lagi tanpa peka besar/kecil huruf & spasi berlebih (jaga-jaga
// nama tab sheet sedikit berbeda dari konstanta CONFIG). Jika tetap tidak
// ketemu, pesan error menyebutkan daftar nama sheet yang SEBENARNYA ada,
// supaya gampang dilacak penyebabnya.
function sheet_(name) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (sh) return sh;

  var target = String(name).replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  var all = ss.getSheets();
  for (var i = 0; i < all.length; i++) {
    var nm = all[i].getName().replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (nm === target) return all[i];
  }
  throw new Error('Sheet "' + name + '" tidak ditemukan. Sheet yang tersedia di spreadsheet ini: ' +
    all.map(function (s) { return '"' + s.getName() + '"'; }).join(', '));
}

// Pastikan sheet punya header sesuai HEADERS[key]; buat sheet bila belum ada
function ensureSheet_(name, headers) {
  var s = ss_();
  var sh = s.getSheetByName(name);
  if (!sh) {
    sh = s.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

// Ambil header ASLI (baris 1) suatu sheet, apa adanya sesuai urutan kolom
// sebenarnya di spreadsheet -- ini sumber kebenaran, BUKAN array HEADERS.*
// di CONFIG (yang hanya dipakai frontend untuk tahu field apa saja yang ada).
function getSheetHeaders_(sheetName) {
  var sh = sheet_(sheetName);
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) return [];
  return sh.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function (h) { return String(h).replace(/\s+/g, ' ').trim(); });
}

// [FIX 1] Ambil nilai kolom kunci (ID ABSEN) dari sebuah object hasil
// readSheetAsObjects_(), TIDAK peka besar/kecil huruf pada nama header.
// Ini jaga-jaga bila teks header asli di sheet (mis. Tbl Bio) sedikit
// berbeda kapitalisasi/spasi dari konstanta CONFIG.KEY_COL ('ID ABSEN'),
// yang sebelumnya menyebabkan SEMUA pencarian ID gagal walau data ada.
function getKeyValue_(rowObj) {
  if (!rowObj) return undefined;
  if (Object.prototype.hasOwnProperty.call(rowObj, CONFIG.KEY_COL)) {
    return rowObj[CONFIG.KEY_COL];
  }
  var target = CONFIG.KEY_COL.toLowerCase();
  var keys = Object.keys(rowObj);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === target) return rowObj[keys[i]];
  }
  return undefined;
}

// Normalisasi ID ABSEN untuk dibandingkan (trim + lowercase). Dipakai
// di semua pencarian/pencocokan ID supaya konsisten & tidak peka
// besar/kecil huruf atau spasi berlebih.
function normalizeId_(val) {
  return (val === null || val === undefined) ? '' : String(val).trim().toLowerCase();
}

// Ambil seluruh data sheet sebagai array of object {headerAsli: value},
// menyertakan _row = nomor baris asli di sheet (untuk update/delete).
// Pemetaan kolom dilakukan berdasarkan NAMA header di baris 1 sheet,
// bukan berdasarkan posisi/urutan tetap -- sehingga tetap benar walau
// urutan kolom di sheet asli berbeda dari yang diasumsikan script.
function readSheetAsObjects_(sheetName) {
  var sh = sheet_(sheetName);
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var headers = getSheetHeaders_(sheetName);
  var values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var isEmpty = row.every(function (v) { return v === '' || v === null; });
    if (isEmpty) continue;
    var obj = { _row: i + 2 };
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue; // lewati kolom tanpa header
      obj[headers[c]] = row[c];
    }
    out.push(obj);
  }
  return out;
}

// Tulis/update satu baris berdasarkan NAMA header (hanya kolom yang ada
// di payload & dikenali sheet yang diubah; kolom lain di baris itu
// dibiarkan apa adanya, tidak tertimpa kosong).
function writeRowByHeaders_(sh, rowNumber, payload) {
  var lastCol = sh.getLastColumn();
  var headers = getSheetHeaders_(sh.getName());
  var current = sh.getRange(rowNumber, 1, 1, lastCol).getValues()[0];
  for (var c = 0; c < headers.length; c++) {
    var h = headers[c];
    if (h && Object.prototype.hasOwnProperty.call(payload, h)) {
      current[c] = payload[h];
    }
  }
  sh.getRange(rowNumber, 1, 1, lastCol).setValues([current]);
}

// Tambah baris baru berdasarkan NAMA header sheet saat ini.
function appendRowByHeaders_(sh, payload) {
  var headers = getSheetHeaders_(sh.getName());
  var row = headers.map(function (h) {
    return (h && Object.prototype.hasOwnProperty.call(payload, h)) ? payload[h] : '';
  });
  sh.appendRow(row);
}

function rowFromObject_(obj, headers) {
  return headers.map(function (h) {
    var v = obj[h];
    return (v === undefined || v === null) ? '' : v;
  });
}

// ====== 4. UTIL TANGGAL =========================================

var BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli',
  'Agustus','September','Oktober','November','Desember'];

// Mengubah berbagai format input tanggal menjadi objek Date
function parseDateFlexible_(val) {
  if (!val && val !== 0) return null;
  if (Object.prototype.toString.call(val) === '[object Date]') {
    return isNaN(val.getTime()) ? null : val;
  }
  var s = String(val).trim();
  if (!s) return null;

  // format ISO dari <input type=date> : yyyy-mm-dd
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  // format "13 Januari 1993"
  var idFmt = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (idFmt) {
    var mIdx = BULAN_ID.findIndex(function (b) {
      return b.toLowerCase() === idFmt[2].toLowerCase();
    });
    if (mIdx > -1) return new Date(Number(idFmt[3]), mIdx, Number(idFmt[1]));
  }

  // format M/D/YYYY atau MM/DD/YYYY
  var us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return new Date(Number(us[3]), Number(us[1]) - 1, Number(us[2]));

  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateID_(dateVal) {
  var d = parseDateFlexible_(dateVal);
  if (!d) return '';
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  return pad(d.getDate()) + ' ' + BULAN_ID[d.getMonth()] + ' ' + d.getFullYear();
}

function formatDateISO_(dateVal) {
  var d = parseDateFlexible_(dateVal);
  if (!d) return '';
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

// Sebagian field TMT (khususnya "TMT Valid STR") kadang diisi teks
// seperti "Seumur Hidup" alih-alih tanggal (STR terbitan lama sebelum
// aturan wajib perpanjangan 5 tahun). Fungsi ini mengenali teks tsb.
var LIFETIME_KEYWORDS_ = ['seumur hidup', 'lifetime', 'permanent', 'selamanya'];
function isLifetimeText_(val) {
  if (!val) return false;
  var s = String(val).trim().toLowerCase();
  return LIFETIME_KEYWORDS_.some(function (kw) { return s.indexOf(kw) > -1; });
}

// Format tanggal utk ditampilkan, TAPI kalau isinya teks non-tanggal
// (mis. "Seumur Hidup") maka teks aslinya ditampilkan apa adanya,
// bukan dikosongkan.
function formatTanggalFleksibel_(val) {
  if (val === '' || val === null || val === undefined) return '';
  var d = parseDateFlexible_(val);
  if (d) return formatDateID_(val);
  return String(val).trim(); // teks seperti "Seumur Hidup" ditampilkan apa adanya
}

// Nilai waktu untuk keperluan SORTING/membandingkan "mana yang terbaru".
// - Tanggal valid -> timestamp aslinya
// - Teks "Seumur Hidup" dkk -> dianggap TIDAK PERNAH KEDALUWARSA
//   (prioritas tertinggi, memakai Infinity)
// - Kosong / teks lain yang tidak dikenali -> dianggap paling lama (-Infinity)
function dateValueForSort_(val) {
  var d = parseDateFlexible_(val);
  if (d) return d.getTime();
  if (isLifetimeText_(val)) return Infinity;
  return -Infinity;
}

function calcUmur_(tglLahir) {
  var d = parseDateFlexible_(tglLahir);
  if (!d) return '';
  var today = new Date();
  var umur = today.getFullYear() - d.getFullYear();
  var m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) umur--;
  return umur;
}

// [BARU] Ubah link "share" Google Drive (…/file/d/<ID>/view?usp=sharing)
// menjadi URL gambar langsung yang bisa dipakai di tag <img>. Jika format
// tidak dikenali, link asli dikembalikan apa adanya (fallback).
function driveViewUrlToDirect_(url) {
  if (!url) return '';
  var s = String(url).trim();
  if (!s) return '';
  var m = s.match(/\/d\/([a-zA-Z0-9_-]+)/) || s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m && m[1]) {
    return 'https://drive.google.com/uc?export=view&id=' + m[1];
  }
  return s;
}

// ====== 5. TBL REFF (dropdown & lookup) =========================

// Baca Tbl Reff: baris 1 = nama kategori per kolom, baris 2+ = daftar opsi
function getReffOptions_(categoryName) {
  try {
    var sh = sheet_(CONFIG.SHEET_REFF);
    var lastCol = sh.getLastColumn();
    var lastRow = sh.getLastRow();
    if (lastRow < 2 || lastCol < 1) return [];
    var headerRow = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    var colIdx = -1;
    for (var c = 0; c < headerRow.length; c++) {
      if (String(headerRow[c]).trim().toLowerCase() === categoryName.trim().toLowerCase()) {
        colIdx = c; break;
      }
    }
    if (colIdx === -1) return [];
    var values = sh.getRange(2, colIdx + 1, lastRow - 1, 1).getValues();
    var out = [];
    values.forEach(function (r) {
      var v = r[0];
      if (v !== '' && v !== null && v !== undefined) out.push(v);
    });
    return out;
  } catch (err) {
    return [];
  }
}

// Lookup "Pangkat/Gol. Ruang" dari kode GOL, memakai range A:C Tbl Reff
// (kolom A = kode GOL, kolom C = label Pangkat/Gol. Ruang) sampai baris 25
function lookupPangkatGolRuang_(golCode) {
  if (!golCode) return '';
  try {
    var sh = sheet_(CONFIG.SHEET_REFF);
    var lastRow = Math.min(sh.getLastRow(), 25);
    if (lastRow < 2) return '';
    var data = sh.getRange(2, 1, lastRow - 1, 3).getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(golCode).trim()) {
        return data[i][2];
      }
    }
    return '';
  } catch (err) {
    return '';
  }
}

// [DIUBAH] Sumber dropdown 7 field ini SEKARANG dibaca dari KOLOM &
// RENTANG BARIS TETAP di "Tbl Reff" (bukan lagi cocokkan nama header),
// sesuai permintaan eksplisit -- supaya tidak bergantung pada teks
// header row 1 Tbl Reff harus persis sama dengan nama field form.
var REFF_COLUMN_MAP_ = {
  'GOL': { col: 'A', start: 2, end: 30 },
  'NAMA SK': { col: 'AA', start: 2, end: 50 },
  'JABATAN PERMENPAN': { col: 'H', start: 2, end: 150 },
  'KELAS JABATAN': { col: 'Z', start: 2, end: 20 },
  'JABATAN TPP': { col: 'H', start: 2, end: 150 },
  'TEMPAT TUGAS': { col: 'J', start: 2, end: 80 },
  'JABATAN': { col: 'I', start: 2, end: 70 },
  // [BARU] tambahan gelombang ke-2
  'STATUS PEGAWAI': { col: 'F', start: 2, end: 15 },
  'TINGKAT PEND': { col: 'P', start: 2, end: 50 },
  'NAMA KAMPUS': { col: 'N', start: 2, end: 200 },
  'JURUSAN/PEMINATAN': { col: 'O', start: 2, end: 150 },
  'JENIS PEGAWAI': { col: 'G', start: 2, end: 15 }
};

// Ubah huruf kolom (A, B, ..., Z, AA, AB, ...) jadi nomor indeks kolom (1-based)
function columnLetterToIndex_(letter) {
  var col = 0;
  var s = String(letter).toUpperCase();
  for (var i = 0; i < s.length; i++) {
    col = col * 26 + (s.charCodeAt(i) - 64);
  }
  return col;
}

// Baca opsi dropdown dari kolom & rentang baris TETAP di "Tbl Reff"
// (mis. col='AA', start=2, end=50 -> baca AA2:AA50), bukan berdasar
// nama header baris 1 seperti getReffOptions_() versi lama.
function getReffColumnOptions_(colLetter, startRow, endRow) {
  try {
    var sh = sheet_(CONFIG.SHEET_REFF);
    var colIdx = columnLetterToIndex_(colLetter);
    var numRows = endRow - startRow + 1;
    if (numRows < 1) return [];
    var values = sh.getRange(startRow, colIdx, numRows, 1).getValues();
    var out = [];
    values.forEach(function (r) {
      var v = r[0];
      if (v !== '' && v !== null && v !== undefined) out.push(v);
    });
    return out;
  } catch (err) {
    return [];
  }
}

function getAllDropdownOptions() {
  var out = {};

  // Kategori sisa (belum diminta pindah ke kolom tetap) tetap cocokkan
  // berdasar nama header row 1
  var headerNameCategories = ['JENIS KELAMIN', 'AGAMA'];
  headerNameCategories.forEach(function (cat) {
    var fromReff = getReffOptions_(cat);
    out[cat] = fromReff.length ? fromReff : (STATIC_OPTIONS[cat] || []);
  });

  // [BARU] 7 kategori ini dibaca dari kolom & rentang tetap di Tbl Reff
  Object.keys(REFF_COLUMN_MAP_).forEach(function (cat) {
    var m = REFF_COLUMN_MAP_[cat];
    var fromReff = getReffColumnOptions_(m.col, m.start, m.end);
    out[cat] = fromReff.length ? fromReff : (STATIC_OPTIONS[cat] || []);
  });

  out['DATE_FIELDS'] = DATE_FIELDS;
  return out;
}

// ====== 6. REBUILD TBL PEGAWAI ===================================

function latestByDate_(records, dateField) {
  if (!records.length) return null;
  var sorted = records.slice().sort(function (a, b) {
    var da = parseDateFlexible_(a[dateField]);
    var db = parseDateFlexible_(b[dateField]);
    var ta = da ? da.getTime() : -Infinity;
    var tb = db ? db.getTime() : -Infinity;
    if (tb !== ta) return tb - ta;
    return b._row - a._row; // fallback: baris paling bawah dianggap terbaru
  });
  return sorted[0];
}

// Pilih baris dengan tanggal terbaru, memakai NILAI TERBESAR dari dua
// kolom tanggal sekaligus (dipakai untuk Tbl Rwyt SIP-STR: TMT Valid SIP
// & TMT Valid STR -- baris dengan salah satu tanggal valid paling baru
// dianggap data SIP/STR terkini untuk pegawai tsb).
function latestByMaxOfTwoDates_(records, field1, field2) {
  if (!records.length) return null;
  function maxTime(r) {
    var t1 = dateValueForSort_(r[field1]);
    var t2 = dateValueForSort_(r[field2]);
    return Math.max(t1, t2);
  }
  var sorted = records.slice().sort(function (a, b) {
    var diff = maxTime(b) - maxTime(a);
    if (diff !== 0) return diff;
    return b._row - a._row;
  });
  return sorted[0];
}

function rebuildTblPegawai() {
  // Tbl Bio adalah sumber utama & wajib ada -> biarkan error apa adanya
  // bila memang tidak ditemukan (pesan dari sheet_() sudah informatif).
  var bioList = readSheetAsObjects_(CONFIG.SHEET_BIO);
  // Sheet riwayat lain sifatnya opsional (mungkin belum dibuat / belum
  // diisi) -> pakai safeReadSheet_ supaya tidak menjatuhkan seluruh
  // rebuild (dan operasi saveBio/saveRiwayat yang memanggilnya) hanya
  // karena satu sheet riwayat belum ada.
  var statusList = safeReadSheet_(CONFIG.SHEET_STATUS);
  var pendList = safeReadSheet_(CONFIG.SHEET_PEND);
  var pangkatList = safeReadSheet_(CONFIG.SHEET_PANGKAT);
  var t4List = safeReadSheet_(CONFIG.SHEET_T4TUGAS);
  var masaKerjaList = safeReadSheet_(CONFIG.SHEET_MASAKERJA);
  var sipStrList = safeReadSheet_(CONFIG.SHEET_SIPSTR);
  var kgbList = safeReadSheet_(CONFIG.SHEET_KGB); // [BARU]

  // [FIX 1] groupBy sekarang memakai getKeyValue_() (bukan
  // r[CONFIG.KEY_COL] langsung) supaya tidak peka besar/kecil huruf
  // pada nama header ID ABSEN di masing-masing sheet riwayat.
  function groupBy(list) {
    var map = {};
    list.forEach(function (r) {
      var key = normalizeId_(getKeyValue_(r));
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return map;
  }

  var statusByID = groupBy(statusList);
  var pendByID = groupBy(pendList);
  var pangkatByID = groupBy(pangkatList);
  var t4ByID = groupBy(t4List);
  var masaKerjaByID = groupBy(masaKerjaList);
  var sipStrByID = groupBy(sipStrList);
  var kgbByID = groupBy(kgbList); // [BARU]

  var outRows = [];

  bioList.forEach(function (bio) {
    var idRaw = getKeyValue_(bio);
    var id = normalizeId_(idRaw);
    if (!id) return;

    var statusRecs = statusByID[id] || [];
    var latestStatus = latestByDate_(statusRecs, 'TMT STATUS PEG');
    var statusAktif = latestStatus &&
      String(latestStatus['STATUS PEGAWAI']).trim().toLowerCase() === 'aktif';
    if (!statusAktif) return; // hanya tampilkan pegawai Aktif

    var latestPend = latestByDate_(pendByID[id] || [], 'TAHUN LULUS');
    var latestPangkat = latestByDate_(pangkatByID[id] || [], 'TMT');
    var latestT4 = latestByDate_(t4ByID[id] || [], 'TMT TEMPAT TUGAS');
    var latestMasaKerja = latestByDate_(masaKerjaByID[id] || [], 'TMT RS Terakhir');
    var latestSipStr = latestByMaxOfTwoDates_(sipStrByID[id] || [], 'TMT Valid SIP', 'TMT Valid STR');
    // [BARU] KGB berulang tiap 2 tahun sejak TMT KGB terakhir -- next
    // date dihitung di sini (bukan cuma disimpan tanggal terakhirnya)
    // supaya modul Notifikasi tinggal baca kolom jadi dari Tbl Pegawai,
    // tanpa perlu scan ulang Tbl Rwyt KGB tiap kali cek notifikasi.
    var latestKgb = latestByDate_(kgbByID[id] || [], 'TMT KGB');
    var tmtKgbBerikutnya = '';
    if (latestKgb) {
      var dKgb = parseDateFlexible_(latestKgb['TMT KGB']);
      if (dKgb) {
        var next = new Date(dKgb.getFullYear() + 2, dKgb.getMonth(), dKgb.getDate());
        tmtKgbBerikutnya = formatDateID_(next);
      }
    }

    var golRuang = latestPangkat ? lookupPangkatGolRuang_(latestPangkat['GOL']) : '';
    var tempatLahir = bio['TEMPAT LAHIR'] || bio['KOTA TEMPAT LAHIR'] || '';
    var ttl = tempatLahir
      ? (tempatLahir + (bio['TANGGAL LAHIR'] ? ', ' + formatDateID_(bio['TANGGAL LAHIR']) : ''))
      : formatDateID_(bio['TANGGAL LAHIR']);

    var row = {
      'ID ABSEN': idRaw,
      'NIK': bio['NIK'],
      'NIP': (latestStatus && latestStatus['NIP']) ? latestStatus['NIP'] : bio['NIP'], // [DIUBAH] ambil dari TMT status terbaru di Tbl Rwyt Status; fallback ke Tbl Bio kalau baris status tsb belum ada isian NIP
      'NPWP': bio['NPWP'],
      'KARPEG-NAKERTRANS': bio['KARPEG-NAKERTRANS'],
      'NAMA': bio['NAMA'],
      'JENIS KELAMIN': bio['JENIS KELAMIN'],
      'AGAMA': bio['AGAMA'],
      'EMAIL': bio['EMAIL'],
      'NOMOR HP': bio['NOMOR HP'],
      'TEMPAT TANGGAL LAHIR': ttl,
      'UMUR': calcUmur_(bio['TANGGAL LAHIR']),
      'STATUS PEGAWAI': latestStatus ? latestStatus['STATUS PEGAWAI'] : '',
      'TMT STATUS PEG': latestStatus ? formatDateID_(latestStatus['TMT STATUS PEG']) : '',
      'JENIS PEGAWAI': latestStatus ? latestStatus['JENIS PEGAWAI'] : '',
      'NO SURAT KEPUTUSAN STATUS': latestStatus ? latestStatus['NO SURAT KEPUTUSAN'] : '',
      'TMT SK STATUS': latestStatus ? formatDateID_(latestStatus['TMT SK']) : '',
      'TINGKAT PEND': latestPend ? latestPend['TINGKAT PEND'] : '',
      'NAMA KAMPUS': latestPend ? latestPend['NAMA KAMPUS'] : '',
      'JURUSAN/PEMINATAN': latestPend ? latestPend['JURUSAN/PEMINATAN'] : '',
      'GELAR DEPAN': latestPend ? latestPend['GELAR DEPAN'] : '',
      'GELAR BELAKANG': latestPend ? latestPend['GELAR BELAKANG'] : '',
      'GOL': latestPangkat ? latestPangkat['GOL'] : '',
      'PANGKAT GOL.RUANG': golRuang,
      'JABATAN PERMENPAN': latestPangkat ? latestPangkat['JABATAN PERMENPAN'] : '',
      'KELAS JABATAN': latestPangkat ? latestPangkat['KELAS JABATAN'] : '',
      'TMT PANGKAT': latestPangkat ? formatDateID_(latestPangkat['TMT']) : '',
      'GAJI POKOK': latestPangkat ? latestPangkat['GAJI POKOK'] : '',
      'TPP': latestPangkat ? latestPangkat['JABATAN TPP'] : '',
      'TEMPAT TUGAS': latestT4 ? latestT4['TEMPAT TUGAS'] : '',
      'JABATAN': latestT4 ? latestT4['JABATAN'] : '',
      'TMT TEMPAT TUGAS': latestT4 ? formatDateID_(latestT4['TMT TEMPAT TUGAS']) : '',
      'MASA KERJA': latestMasaKerja ? latestMasaKerja['MASA KERJA'] : '',
      'NOMOR SIP': latestSipStr ? latestSipStr['Nomor SIP'] : '',
      'TMT TERBIT SIP': latestSipStr ? formatTanggalFleksibel_(latestSipStr['TMT Terbit SIP']) : '',
      'TMT VALID SIP': latestSipStr ? formatTanggalFleksibel_(latestSipStr['TMT Valid SIP']) : '',
      'NOMOR STR': latestSipStr ? latestSipStr['Nomor STR'] : '',
      'TMT TERBIT STR': latestSipStr ? formatTanggalFleksibel_(latestSipStr['TMT Terbit STR']) : '',
      'TMT VALID STR': latestSipStr ? formatTanggalFleksibel_(latestSipStr['TMT Valid STR']) : '',
      'LINK FOTO': bio['LINK FOTO'] || '', // [FIX 3/4] ikut dari Tbl Bio
      // [BARU] Sumber field notifikasi KGB
      'TMT KGB TERAKHIR': latestKgb ? formatDateID_(latestKgb['TMT KGB']) : '',
      'GAJI BERKALA TERAKHIR': latestKgb ? latestKgb['GAJI BERKALA'] : '',
      'TMT KGB BERIKUTNYA': tmtKgbBerikutnya,
      'TMT RS PERTAMA': latestMasaKerja ? formatDateID_(latestMasaKerja['TMT RS PERTAMA']) : '' // [BARU] dari Tbl Masa Kerja kolom B, ditaruh paling kanan
    };
    outRows.push(row);
  });

  var sh = ensureSheet_(CONFIG.SHEET_PEGAWAI, HEADERS.PEGAWAI);
  sh.clearContents();
  sh.getRange(1, 1, 1, HEADERS.PEGAWAI.length).setValues([HEADERS.PEGAWAI]);
  if (outRows.length) {
    var values = outRows.map(function (r) { return rowFromObject_(r, HEADERS.PEGAWAI); });
    sh.getRange(2, 1, values.length, HEADERS.PEGAWAI.length).setValues(values);
  }
  sh.setFrozenRows(1);
  return outRows.length;
}

// ====== 7. API UNTUK FRONTEND (dipanggil via google.script.run) ==

function getInitialData() {
  return {
    dropdowns: getAllDropdownOptions(),
    headers: HEADERS,
    dashboard: getDashboardStats(),
    pegawaiRingkas: getPegawaiRingkas()
  };
}

// Daftar ringkas untuk pencarian cepat di sisi client
function getPegawaiRingkas() {
  var sh = ss_().getSheetByName(CONFIG.SHEET_PEGAWAI);
  if (!sh || sh.getLastRow() < 2) return [];
  var cols = ['ID ABSEN', 'NAMA', 'JABATAN', 'TEMPAT TUGAS', 'STATUS PEGAWAI'];
  var idxMap = cols.map(function (c) { return HEADERS.PEGAWAI.indexOf(c) + 1; });
  var lastRow = sh.getLastRow();
  var data = sh.getRange(2, 1, lastRow - 1, HEADERS.PEGAWAI.length).getValues();
  return data.map(function (row) {
    var o = {};
    cols.forEach(function (c, i) { o[c] = row[idxMap[i] - 1]; });
    return o;
  });
}

// [FIX 2] Counter kategori yang menggabungkan nilai secara
// case-insensitive & trim spasi (mis. "Islam" & "islam" digabung jadi
// satu), lalu memetakan ke label baku dari STATIC_OPTIONS bila ada
// yang cocok -- supaya legend chart tidak pernah pecah jadi dua entri
// hanya karena beda kapitalisasi/spasi di data sumber.
function makeCounter_(canonicalList) {
  var counts = {};
  var labelForKey = {};
  return {
    bump: function (rawVal) {
      var trimmed = (rawVal === null || rawVal === undefined) ? '' : String(rawVal).replace(/\s+/g, ' ').trim();
      var key = trimmed ? trimmed.toLowerCase() : '__empty__';
      if (!labelForKey[key]) {
        var canon = null;
        if (canonicalList) {
          canon = canonicalList.find(function (c) { return String(c).trim().toLowerCase() === key; });
        }
        labelForKey[key] = canon || (trimmed || '(Tidak diisi)');
      }
      var label = labelForKey[key];
      counts[label] = (counts[label] || 0) + 1;
    },
    result: function () { return counts; }
  };
}

function getDashboardStats() {
  var emptyStats = {
    total: 0,
    byGender: {}, byAgama: {}, byJenisPegawai: {}, byGolongan: {},
    byTingkatPend: {}, byJurusan: {}, byTempatTugas: {}, ageBuckets: {},
    byUnitJabatan: { units: [], jabatanKeys: [], matrix: {} } // [BARU]
  };

  var sh = ss_().getSheetByName(CONFIG.SHEET_DASHBOARD);
  if (!sh) return emptyStats;

  // [PENTING] Sheet "Tbl Dashboard" adalah QUERY formula bersumber dari
  // "Tbl Pegawai" (sama seperti "Tbl Profil"). Fungsi ini butuh kolom
  // "JABATAN" (utk chart Unit x Jabatan) -- kalau formula QUERY di
  // sheet tsb belum menyertakan kolom JABATAN, field ini akan selalu
  // kosong dan semua pegawai masuk kategori "(Tidak diisi)". Cek &
  // update manual formula QUERY-nya kalau perlu.

  var data = readSheetAsObjects_(CONFIG.SHEET_DASHBOARD); // baca apa adanya, berbasis nama header baris 1
  if (!data.length) return emptyStats;

  var cGender = makeCounter_(STATIC_OPTIONS['JENIS KELAMIN']);
  var cAgama = makeCounter_(STATIC_OPTIONS['AGAMA']);
  var cJenisPeg = makeCounter_(STATIC_OPTIONS['JENIS PEGAWAI']);
  var cGol = makeCounter_(STATIC_OPTIONS['GOL']);
  var cPend = makeCounter_(STATIC_OPTIONS['TINGKAT PEND']);
  var cJurusan = makeCounter_(null);
  var cUnit = makeCounter_(null);
  var ageBuckets = {};
  var total = 0;

  // [BARU] Golongan di dashboard HANYA dihitung utk jenis pegawai ini
  // (CPNS/PNS/PNS Titipan/P3K/P3K Titipan) -- Honor/Kontrak/Magang/PW
  // biasanya tidak punya golongan PNS, jadi dikeluarkan dari chart ini.
  var GOL_JENIS_ALLOWED_ = ['cpns', 'pns', 'pns titipan', 'p3k', 'p3k titipan'];

  // [BARU] Data mentah utk stacked bar chart Unit x Jabatan
  var unitJabatanCounts = {}; // { unit: { jabatan: count } }
  var jabatanTotals = {};     // total per jabatan (semua unit), utk pilih Top N jabatan

  data.forEach(function (row) {
    total++;
    cGender.bump(row['JENIS KELAMIN']);
    cAgama.bump(row['AGAMA']);
    cJenisPeg.bump(row['JENIS PEGAWAI']);
    cPend.bump(row['TINGKAT PEND']);
    cJurusan.bump(row['JURUSAN/PEMINATAN']);
    cUnit.bump(row['TEMPAT TUGAS']);

    var jenisKey = String(row['JENIS PEGAWAI'] || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (GOL_JENIS_ALLOWED_.indexOf(jenisKey) > -1) {
      cGol.bump(row['GOL']);
    }

    var umur = row['UMUR'];
    var bucket = '(N/A)';
    if (typeof umur === 'number') {
      if (umur < 25) bucket = '< 25';
      else if (umur < 35) bucket = '25-34';
      else if (umur < 45) bucket = '35-44';
      else if (umur < 55) bucket = '45-54';
      else bucket = '55+';
    }
    ageBuckets[bucket] = (ageBuckets[bucket] || 0) + 1;

    // [BARU] Unit x Jabatan
    var unit = String(row['TEMPAT TUGAS'] || '').trim() || '(Tidak diisi)';
    var jabatan = String(row['JABATAN'] || '').trim() || '(Tidak diisi)';
    if (!unitJabatanCounts[unit]) unitJabatanCounts[unit] = {};
    unitJabatanCounts[unit][jabatan] = (unitJabatanCounts[unit][jabatan] || 0) + 1;
    jabatanTotals[jabatan] = (jabatanTotals[jabatan] || 0) + 1;
  });

  // Top 10 unit (berdasarkan total pegawai di unit tsb)
  var unitTotals = {};
  Object.keys(unitJabatanCounts).forEach(function (u) {
    var sum = 0;
    Object.keys(unitJabatanCounts[u]).forEach(function (j) { sum += unitJabatanCounts[u][j]; });
    unitTotals[u] = sum;
  });
  var topUnits = Object.keys(unitTotals)
    .sort(function (a, b) { return unitTotals[b] - unitTotals[a]; })
    .slice(0, 10);

  // Top 8 jabatan (paling banyak secara keseluruhan) -- sisanya digabung
  // "Lainnya" supaya legend chart tidak penuh puluhan jabatan berbeda.
  var TOP_JABATAN_N = 8;
  var topJabatanList = Object.keys(jabatanTotals)
    .sort(function (a, b) { return jabatanTotals[b] - jabatanTotals[a]; })
    .slice(0, TOP_JABATAN_N);
  var topJabatanSet = {};
  topJabatanList.forEach(function (j) { topJabatanSet[j] = true; });

  var matrix = {};
  topUnits.forEach(function (u) {
    matrix[u] = {};
    Object.keys(unitJabatanCounts[u]).forEach(function (j) {
      var key = topJabatanSet[j] ? j : 'Lainnya';
      matrix[u][key] = (matrix[u][key] || 0) + unitJabatanCounts[u][j];
    });
  });
  var jabatanKeysFinal = topJabatanList.concat(['Lainnya']);

  return {
    total: total,
    byGender: cGender.result(),
    byAgama: cAgama.result(),
    byJenisPegawai: cJenisPeg.result(),
    byGolongan: cGol.result(),
    byTingkatPend: cPend.result(),
    byJurusan: cJurusan.result(),
    byTempatTugas: cUnit.result(),
    ageBuckets: ageBuckets,
    byUnitJabatan: { units: topUnits, jabatanKeys: jabatanKeysFinal, matrix: matrix } // [BARU]
  };
}

function searchPegawai(query) {
  var list = getPegawaiRingkas();
  if (!query) return list.slice(0, 50);
  var q = query.trim().toLowerCase();
  return list.filter(function (p) {
    return String(p['ID ABSEN']).toLowerCase().indexOf(q) > -1 ||
           String(p['NAMA']).toLowerCase().indexOf(q) > -1;
  }).slice(0, 50);
}

// [FIX BESAR] Serializer otomatis google.script.run KADANG GAGAL untuk
// object bersarang kompleks seperti ini (object + beberapa array-of-
// object + Date) walau sudah pakai runtime V8 -- gejalanya: browser
// menerima dump toString() ala Java ("{key=value, arr=[Ljava.lang.
// Object;@hash]}") alih-alih JSON asli, sehingga halaman Profil gagal
// dibaca. Solusinya: JANGAN andalkan serializer otomatis -- di sini
// kita JSON.stringify() SENDIRI sebelum return, lalu frontend
// (loadDetail() di JavaScript.html) JSON.parse() balik. Ini melewati
// sepenuhnya mekanisme bawaan yang bermasalah.
function getPegawaiDetail(idAbsen) {
  if (idAbsen === null || idAbsen === undefined) return null;

  var targetId = normalizeId_(idAbsen);
  if (!targetId) return null;

  var profilAll = readSheetAsObjects_(CONFIG.SHEET_PROFIL);

  var profil = profilAll.find(function (r) {
    return normalizeId_(getKeyValue_(r)) === targetId;
  });

  if (!profil) return null;

  // Sediakan URL foto siap-pakai (hasil konversi link share Drive)
  profil['FOTO_URL'] = driveViewUrlToDirect_(profil['LINK FOTO']);

  // Helper pencarian riwayat (tetap dipakai untuk tab histori)
  function filterFor(sheetName) {
    try {
      return readSheetAsObjects_(sheetName)
        .filter(function (r) {
          return normalizeId_(getKeyValue_(r)) === targetId;
        })
        .sort(function (a, b) { return b._row - a._row; });
    } catch (err) {
      return []; // sheet riwayat opsional; jangan gagalkan seluruh profil
    }
  }

  var detail = {
    profil: profil,
    status: filterFor(CONFIG.SHEET_STATUS),
    pend: filterFor(CONFIG.SHEET_PEND),
    pangkat: filterFor(CONFIG.SHEET_PANGKAT),
    t4tugas: filterFor(CONFIG.SHEET_T4TUGAS),
    sipstr: filterFor(CONFIG.SHEET_SIPSTR), // [FIX 6] dibutuhkan tab SIP & STR
    kgb: filterFor(CONFIG.SHEET_KGB) // [BARU] dibutuhkan tab KGB
  };

  // JSON.stringify otomatis mengubah Date jadi string ISO yang aman
  // (mis. "2029-12-12T16:00:00.000Z"), sama seperti hasil test di
  // Diagnostics.gs -- BUKAN format "Wed Dec 12 08:00:00 PST 2029"
  // yang muncul saat serializer bawaan gagal.
  return JSON.stringify(detail);
}

// [FIX 3] Tambah pegawai baru: menulis Tbl Bio SEKALIGUS riwayat awal
// dalam satu transaksi terkunci, baru rebuildTblPegawai() sekali di
// akhir. Ini menggantikan alur lama (saveBio() sendirian) yang membuat
// pegawai baru tidak pernah muncul di Tbl Pegawai/Profil/Dashboard
// karena tidak ada riwayat Status "Aktif".
//
// Bentuk payload yang diharapkan dari frontend:
//   {
//     bio:     { 'ID ABSEN': ..., 'NAMA': ..., ... }      // wajib
//     status:  { 'STATUS PEGAWAI': 'Aktif', ... } | null  // wajib diisi
//     pend:    { ... } | null                             // opsional
//     pangkat: { ... } | null                              // opsional
//     t4tugas: { ... } | null                              // opsional
//     sipstr:  { ... } | null                              // opsional
//   }
// Section selain 'status' hanya ditulis bila objeknya dikirim & berisi
// minimal satu field terisi ("jika data tersedia"); kalau tidak, cukup
// dilewati -- pegawai tetap tersimpan, riwayat itu bisa ditambahkan
// belakangan lewat tab terkait di halaman Profil.
function saveNewPegawai(payload) {
  return withLock_(function () {
    if (!payload || !payload.bio) throw new Error('Data biodata wajib diisi.');
    var bio = payload.bio;
    var id = String(bio['ID ABSEN'] || '').trim();
    if (!id) throw new Error('ID ABSEN wajib diisi.');
    if (!String(bio['NAMA'] || '').trim()) throw new Error('NAMA wajib diisi.');

    var idNorm = normalizeId_(id);
    var existingBio = readSheetAsObjects_(CONFIG.SHEET_BIO)
      .find(function (r) { return normalizeId_(getKeyValue_(r)) === idNorm; });
    if (existingBio) throw new Error('ID ABSEN "' + id + '" sudah terdaftar. Gunakan ID lain.');

    // [FIX 3] Status kepegawaian WAJIB diisi -- ini satu-satunya syarat
    // supaya pegawai baru dianggap "Aktif" dan muncul di Tbl Pegawai
    // (lihat rebuildTblPegawai()).
    if (!payload.status || !String(payload.status['STATUS PEGAWAI'] || '').trim()) {
      throw new Error('Status Kepegawaian (minimal "Status Pegawai") wajib diisi agar pegawai baru bisa tampil di sistem.');
    }

    // 1) Tulis Tbl Bio
    var shBio = ensureSheet_(CONFIG.SHEET_BIO, HEADERS.BIO);
    appendRowByHeaders_(shBio, bio);

    // 2) Tulis mini-section riwayat yang dikirim & berisi data
    var sections = ['status', 'pend', 'pangkat', 't4tugas', 'sipstr'];
    sections.forEach(function (kind) {
      var data = payload[kind];
      if (!data) return;
      var hasValue = Object.keys(data).some(function (k) {
        return k !== CONFIG.KEY_COL && String(data[k] || '').trim() !== '';
      });
      if (!hasValue) return;

      var cfg = RWYT_CONFIG_[kind];
      var sh = ensureSheet_(CONFIG[cfg.sheet], HEADERS[cfg.headers]);
      data[CONFIG.KEY_COL] = id;
      data['NAMA'] = bio['NAMA'];
      appendRowByHeaders_(sh, data);
    });

    // [BARU] rebuildTblPegawai() SENGAJA TIDAK dipanggil lagi di sini.
    // Tombol "Simpan Pegawai Baru" sekarang HANYA menulis ke Tbl Bio +
    // sheet riwayat (Status/Pend/Pangkat/T4 Tugas/SIP-STR). Regenerasi
    // "Tbl Pegawai" (dan otomatis Tbl Dashboard/Tbl Profil yang
    // formulanya bersumber dari situ) dijalankan terpisah lewat tombol
    // "Update Tabel Pegawai" -> updateTblPegawai(), supaya user bisa
    // menyimpan banyak pegawai/riwayat dulu baru rebuild sekali saat
    // sudah selesai. Rebuild otomatis via onEdit()/trigger per jam
    // tetap berjalan seperti biasa untuk sheet-sheet tsb.
    return { ok: true, isNew: true };
  });
}

// [BARU] Dipanggil dari tombol "Update Tabel Pegawai" di halaman Tambah
// Pegawai (terpisah dari tombol "Simpan Pegawai Baru" -- lihat catatan
// di saveNewPegawai() di atas). Membungkus rebuildTblPegawai() dengan
// LockService yang sama seperti operasi tulis lain, supaya tidak
// tabrakan dengan proses simpan yang berjalan hampir bersamaan.
function updateTblPegawai() {
  return withLock_(function () {
    rebuildTblPegawai();
    return { ok: true };
  });
}

// ---- Simpan Biodata (tambah baru / update) ----
// Dipakai untuk: (a) edit biodata pegawai yang SUDAH ada (dari halaman
// Profil, menggantikan saveProfil() yang dihapus -- lihat [FIX 4]), dan
// (b) tetap tersedia sebagai fungsi tulis-bio generik untuk kasus lain.
// Untuk MENAMBAH pegawai baru, pakai saveNewPegawai() supaya riwayat
// awal (terutama Status "Aktif") ikut terbentuk -- lihat [FIX 3].
function saveBio(payload) {
  return withLock_(function () {
    var sh = ensureSheet_(CONFIG.SHEET_BIO, HEADERS.BIO);
    var id = String(payload['ID ABSEN']).trim();
    if (!id) throw new Error('ID ABSEN wajib diisi.');

    var existing = readSheetAsObjects_(CONFIG.SHEET_BIO);
    var idNorm = normalizeId_(id);
    var found = existing.find(function (r) { return normalizeId_(getKeyValue_(r)) === idNorm; });

    if (found) {
      writeRowByHeaders_(sh, found._row, payload);
    } else {
      appendRowByHeaders_(sh, payload);
    }
    rebuildTblPegawai();
    return { ok: true, isNew: !found };
  });
}

// [FIX 4] Ambil satu baris Tbl Bio APA ADANYA (bukan dari Tbl Profil)
// untuk keperluan pre-fill form "Edit Biodata" di halaman Profil.
// Hasilnya dipakai bersama saveBio() di atas untuk menyimpan perubahan
// -- Tbl Bio adalah sheet asli yang memang boleh ditulis, berbeda
// dengan Tbl Profil yang merupakan hasil formula QUERY (read-only).
function getBioByIdAbsen(idAbsen) {
  var idNorm = normalizeId_(idAbsen);
  if (!idNorm) return null;
  var found = readSheetAsObjects_(CONFIG.SHEET_BIO)
    .find(function (r) { return normalizeId_(getKeyValue_(r)) === idNorm; });
  return found || null;
}

function isIdAbsenExists(id) {
  var idNorm = normalizeId_(id);
  var existing = readSheetAsObjects_(CONFIG.SHEET_BIO);
  return existing.some(function (r) { return normalizeId_(getKeyValue_(r)) === idNorm; });
}

// ---- CRUD generik untuk sheet Riwayat (Status/Pend/Pangkat/T4 Tugas/SIP-STR) ----
// [FIX 6] entri 'sipstr' ditambahkan -- sebelumnya tidak ada sama sekali
// di map ini, jadi Tbl Rwyt SIP-STR tidak bisa ditambah/edit/hapus lewat
// halaman Profil walau datanya tetap ikut dibaca saat rebuildTblPegawai().
var RWYT_CONFIG_ = {
  status: { sheet: 'SHEET_STATUS', headers: 'STATUS' },
  pend: { sheet: 'SHEET_PEND', headers: 'PEND' },
  pangkat: { sheet: 'SHEET_PANGKAT', headers: 'PANGKAT' },
  t4tugas: { sheet: 'SHEET_T4TUGAS', headers: 'T4TUGAS' },
  sipstr: { sheet: 'SHEET_SIPSTR', headers: 'SIPSTR' },
  kgb: { sheet: 'SHEET_KGB', headers: 'KGB' } // [BARU]
};

function saveRiwayat(kind, payload, rowNumber) {
  return withLock_(function () {
    var cfg = RWYT_CONFIG_[kind];
    if (!cfg) throw new Error('Jenis riwayat tidak dikenal: ' + kind);
    var sheetName = CONFIG[cfg.sheet];
    var headers = HEADERS[cfg.headers];
    var sh = ensureSheet_(sheetName, headers);

    // Auto-isi NAMA dari Tbl Bio berdasarkan ID ABSEN agar konsisten
    var id = normalizeId_(payload[CONFIG.KEY_COL]);
    if (!id) throw new Error('ID ABSEN wajib diisi.');
    var bio = readSheetAsObjects_(CONFIG.SHEET_BIO)
      .find(function (r) { return normalizeId_(getKeyValue_(r)) === id; });
    if (bio) payload['NAMA'] = bio['NAMA'];

    if (rowNumber) {
      writeRowByHeaders_(sh, rowNumber, payload);
    } else {
      appendRowByHeaders_(sh, payload);
    }
    rebuildTblPegawai();
    return { ok: true };
  });
}

function deleteRiwayat(kind, rowNumber) {
  return withLock_(function () {
    var cfg = RWYT_CONFIG_[kind];
    if (!cfg) throw new Error('Jenis riwayat tidak dikenal: ' + kind);
    var sh = sheet_(CONFIG[cfg.sheet]);
    sh.deleteRow(Number(rowNumber));
    rebuildTblPegawai();
    return { ok: true };
  });
}

function deleteBio(idAbsen) {
  return withLock_(function () {
    var idNorm = normalizeId_(idAbsen);
    var existing = readSheetAsObjects_(CONFIG.SHEET_BIO);
    var found = existing.find(function (r) { return normalizeId_(getKeyValue_(r)) === idNorm; });
    if (!found) throw new Error('Pegawai tidak ditemukan.');
    sheet_(CONFIG.SHEET_BIO).deleteRow(found._row);
    rebuildTblPegawai();
    return { ok: true };
  });
}