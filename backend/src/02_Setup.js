/**
 * 02_Setup.js
 * Instalasi awal: membuat seluruh worksheet, header, dan master data.
 *
 * Jalankan dari menu SIMPEG → "Install Database" pada spreadsheet,
 * atau langsung `installDatabase()` di editor (proyek standalone).
 */

/** Struktur unit kerja awal (silakan disesuaikan). Unit operasional
 *  (ruang rawat inap, poliklinik, instalasi, dll.) ditambahkan
 *  otomatis oleh modul migrasi dari data tempat tugas pegawai. */
var SEED_UNITS = [
  { kode: 'RSUDLW', nama: 'RSUD Luwuk', level: 1 },
  { kode: 'DIREKSI', nama: 'Kepala RSUD Luwuk', level: 2, parentKode: 'RSUDLW' },
  { kode: 'BPM', nama: 'Bidang Pelayanan Medik', level: 2, parentKode: 'RSUDLW' },
  { kode: 'BKP', nama: 'Bidang Keperawatan', level: 2, parentKode: 'RSUDLW' },
  { kode: 'BPPK', nama: 'Bidang Penunjang Pelayanan Kesehatan', level: 2, parentKode: 'RSUDLW' },
  { kode: 'BADMIN', nama: 'Bidang Administrasi', level: 2, parentKode: 'RSUDLW' },
  { kode: 'KEPEG', nama: 'Subbag Kepegawaian', level: 3, parentKode: 'BADMIN' },
  { kode: 'KEU', nama: 'Bagian Keuangan', level: 3, parentKode: 'BADMIN' },
  { kode: 'UMUM', nama: 'Bagian Umum', level: 3, parentKode: 'BADMIN' },
  { kode: 'PERENC', nama: 'Bagian Perencanaan', level: 3, parentKode: 'BADMIN' }
];

/** Konfigurasi bawaan. */
var SEED_CONFIG = [
  { key: 'NAMA_APLIKASI', value: CONFIG.NAMA_APP, keterangan: 'Nama aplikasi' },
  { key: 'INSTANSI', value: CONFIG.INSTANSI, keterangan: 'Nama instansi pemilik aplikasi' },
  { key: 'UNIT_INDUK', value: CONFIG.UNIT_INDUK, keterangan: 'Nama unit induk organisasi' },
  { key: 'TEMPAT_DIBUAT', value: CONFIG.TEMPAT_DIBUAT, keterangan: 'Kota yang dipakai pada surat/SK' },
  { key: 'SPREADSHEET_ID', value: DEFAULT_SPREADSHEET_ID, keterangan: 'ID spreadsheet database (diset saat instalasi)' },
  { key: 'ROOT_FOLDER_ID', value: '', keterangan: 'ID folder Google Drive root (dokumen, foto, temp)' },
  { key: 'KALENDER_ID', value: '', keterangan: 'ID Google Calendar untuk pengingat (kosong = kalender default)' },
  { key: 'EMAIL_PENGIRIM', value: '', keterangan: 'Alias/email pengirim notifikasi (kosong = email pemilik skrip)' },
  { key: 'NOTIF_SIP_HARI', value: CONFIG.NOTIF_SIP_HARI.join(','), keterangan: 'Ambang pengingat SIP (hari sebelum jatuh tempo, pisah koma)' },
  { key: 'NOTIF_STR_HARI', value: CONFIG.NOTIF_STR_HARI.join(','), keterangan: 'Ambang pengingat STR (hari sebelum jatuh tempo, pisah koma)' },
  { key: 'NOTIF_KGB_HARI', value: CONFIG.NOTIF_KGB_HARI.join(','), keterangan: 'Ambang pengingat KGB (hari sebelum jatuh tempo, pisah koma)' },
  { key: 'NOTIF_DHT_HARI', value: CONFIG.NOTIF_DHT_HARI.join(','), keterangan: 'Ambang pengingat mendekati pensiun (hari sebelum DHT, pisah koma)' },
  { key: 'USIA_PENSIUN_JSON', value: JSON.stringify(CONFIG.USIA_PENSIUN), keterangan: 'Usia pensiun per jenis pegawai (JSON), mis. {"PNS":58,"default":58}' },
  { key: 'RETENSI_LOG_HARI', value: String(CONFIG.RETENSI_LOG_HARI), keterangan: 'Masa simpan log aktivitas (hari)' },
  { key: 'MAX_UPLOAD_MB', value: String(CONFIG.MAX_UPLOAD_MB), keterangan: 'Batas ukuran file unggahan (MB)' },
  { key: 'VERSI_APLIKASI', value: CONFIG.VERSI_APLIKASI, keterangan: 'Versi aplikasi' }
];

/**
 * Instalasi / reset struktur database.
 * Aman dijalankan berulang (idempoten): sheet yang sudah ada tidak
 * ditimpa, hanya header yang ditulis ulang bila belum sesuai.
 */
function installDatabase() {
  var ss = getWorkbook();
  if (!ss) {
    throw AppError(
      'Spreadsheet database tidak dapat diakses. Isi SPREADSHEET_ID atau buka spreadsheet terlebih dahulu.',
      'CONFIG_MISSING'
    );
  }
  var created = [];

  SHEET_NAMES.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      created.push(name);
    }
    writeHeader(name);
    sheet.setFrozenRows(1);
  });

  // Hapus sheet bawaan "Sheet1" bila masih ada
  var def = ss.getSheetByName('Sheet1');
  if (def && ss.getNumSheets() > 1) ss.deleteSheet(def);

  seedMasterData();

  // Simpan referensi database ke Config
  setConfig('SPREADSHEET_ID', ss.getId(), 'ID spreadsheet database (diset saat instalasi)');

  buildMenu();

  alertUi(CONFIG.NAMA_APP,
    'Instalasi selesai.\n\nSheet dibuat: ' +
    (created.length ? created.join(', ') : '(semua sudah ada)') +
    '\n\nLanjutkan dengan menu "SIMPEG" di spreadsheet atau buka Web App.'
  );
}

/** Menyemai master data (config, unit kerja, user admin pertama). */
function seedMasterData() {
  // ---- Config ----
  SEED_CONFIG.forEach(function (c) {
    if (!repoConfig().exists({ key: c.key })) {
      repoConfig().insert({ key: c.key, value: c.value, keterangan: c.keterangan, updated_at: nowIso() });
    }
  });

  // ---- Unit kerja ----
  var kodeToId = {};
  SEED_UNITS.forEach(function (u) {
    var existing = repoUnits().first({ kode: u.kode });
    if (existing) { kodeToId[u.kode] = existing.id; return; }
    var rec = repoUnits().insert({
      kode: u.kode,
      nama: u.nama,
      singkatan: u.singkatan || u.kode,
      level: u.level,
      aktif: true
    });
    kodeToId[u.kode] = rec.id;
  });
  // Relasi induk
  SEED_UNITS.forEach(function (u) {
    if (!u.parentKode) return;
    var child = repoUnits().first({ kode: u.kode });
    if (child && !child.parent_id && kodeToId[u.parentKode]) {
      repoUnits().update(child.id, { parent_id: kodeToId[u.parentKode] });
    }
  });

  // ---- User admin pertama (pembuat spreadsheet) ----
  var email = currentEmail();
  if (email && !repoUsers().exists({ email: email })) {
    repoUsers().insert({
      nip: '',
      nama: 'Administrator Kepegawaian',
      email: email,
      jabatan: 'Administrator Sistem',
      role: 'admin',
      unit_id: kodeToId['KEPEG'] || null,
      aktif: true,
      terakhir_login: '',
      created_at: nowIso()
    });
  }

  flushConfigCache();
}

/** Membuat menu pada spreadsheet (aman untuk proyek standalone). */
function buildMenu() {
  try {
    SpreadsheetApp.getUi()
      .createMenu(CONFIG.APP_NAME + ' RSUD Luwuk')
      .addItem('⚙️ Install Database', 'installDatabase')
      .addItem('🌱 Semai Data Master', 'seedMasterData')
      .addItem('ℹ️ Versi ' + (getConfig('VERSI_APLIKASI') || CONFIG.VERSI_APLIKASI), 'showAbout')
      .addToUi();
  } catch (e) { /* UI tidak tersedia (standalone) */ }
}

/** Alert bila UI spreadsheet tersedia; jika tidak, tulis ke console/log. */
function alertUi(title, message) {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert(title, message, ui.ButtonSet.OK);
  } catch (e) {
    console.log('[' + title + '] ' + message);
  }
}

/** Tampilkan dialog "tentang". */
function showAbout() {
  alertUi(
    CONFIG.NAMA_APP + ' — Versi ' + (getConfig('VERSI_APLIKASI') || CONFIG.VERSI_APLIKASI),
    'Dibangun dengan Google Apps Script & Google Spreadsheet.\nEmail: ' + currentEmail()
  );
}

/** Trigger: dipanggil otomatis saat spreadsheet dibuka. */
function onOpen() {
  buildMenu();
}
