/**
 * 90_Api.js
 * Titik masuk aplikasi:
 *   - doGet()   : menyajikan Web App
 *   - include() : menyisipkan partial HTML/CSS/JS
 *   - apiCall() : router tunggal untuk seluruh permintaan dari UI
 *
 * Setiap aksi di API_REGISTRY memuat resource & action yang divalidasi
 * terhadap matriks PERMISSIONS (11_Auth.js) sebelum fungsi dijalankan.
 */

function doGet(e) {
  e = e || {};
  var params = e.parameter || {};

  var t = HtmlService.createTemplateFromFile('web/index');
  t.appName = CONFIG.NAMA_APP;
  t.versi = getConfig('VERSI_APLIKASI', CONFIG.VERSI_APLIKASI);
  return t.evaluate()
    .setTitle(CONFIG.NAMA_APP)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Menyisipkan isi file lain (CSS/JS/HTML partial). */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* ------------------------------------------------------------------ */
/* Router API                                                          */
/* ------------------------------------------------------------------ */

var API_REGISTRY = {
  /* Profil */
  'profile.get': { fn: getProfile, auth: false },
  'profile.opsiFilter': { fn: opsiFilterPegawai, auth: true, resource: 'pegawai', action: 'read' },
  'config.opsi': { fn: opsiAplikasi, auth: true },

  /* Dashboard */
  'dashboard.get': { fn: getDashboardData, auth: true, resource: 'laporan', action: 'read' },

  /* Pegawai */
  'pegawai.list': { fn: apiDaftarPegawai, auth: true, resource: 'pegawai', action: 'read' },
  'pegawai.detail': { fn: apiDetailPegawai, auth: true, resource: 'pegawai', action: 'read' },
  'pegawai.simpan': { fn: apiSimpanPegawai, auth: true, resource: 'pegawai', action: 'update' },
  'pegawai.hapus': { fn: apiHapusPegawai, auth: true, resource: 'pegawai', action: 'update' },

  /* Riwayat */
  'riwayat.daftar': { fn: apiDaftarRiwayat, auth: true, authorize: izinkanRiwayat('read') },
  'riwayat.simpan': { fn: apiSimpanRiwayat, auth: true, authorize: izinkanRiwayat('update') },
  'riwayat.hapus': { fn: apiHapusRiwayat, auth: true, authorize: izinkanRiwayat('delete') },

  /* Monitoring */
  'monitoring.get': { fn: apiMonitoring, auth: true, resource: 'laporan', action: 'read' },

  /* Usulan KP/KGB */
  'usulan.statistik': { fn: apiStatistikUsulan, auth: true, resource: 'usulan', action: 'read' },
  'usulan.daftar': { fn: apiDaftarUsulan, auth: true, resource: 'usulan', action: 'read' },
  'usulan.detail': { fn: apiDetailUsulan, auth: true, resource: 'usulan', action: 'read' },
  'usulan.siapkan': { fn: apiSiapkanUsulan, auth: true, resource: 'usulan', action: 'read' },
  'usulan.cariPegawai': { fn: apiCariPegawaiUsulan, auth: true, resource: 'usulan', action: 'read' },
  'usulan.simpan': { fn: apiSimpanUsulan, auth: true, resource: 'usulan', action: 'create' },
  'usulan.hapus': { fn: apiHapusUsulan, auth: true, resource: 'usulan', action: 'update' },
  'usulan.ajukan': { fn: apiAjukanUsulan, auth: true, resource: 'usulan', action: 'update' },
  'usulan.batalkan': { fn: apiBatalkanUsulan, auth: true, resource: 'usulan', action: 'update' },
  'usulan.setujui': { fn: apiSetujuiUsulan, auth: true, resource: 'usulan', action: 'approve' },
  'usulan.tolak': { fn: apiTolakUsulan, auth: true, resource: 'usulan', action: 'reject' },
  'usulan.pratinjauSk': { fn: apiPratinjauSk, auth: true, resource: 'usulan', action: 'read' },
  'usulan.cetakSk': { fn: apiCetakSk, auth: true, resource: 'usulan', action: 'update' },

  /* Laporan */
  'laporan.rekapUnit': { fn: laporanRekapUnit, auth: true, resource: 'laporan', action: 'read' },
  'laporan.golongan': { fn: laporanGolongan, auth: true, resource: 'laporan', action: 'read' },
  'laporan.kgbBerikut': { fn: laporanKgbBerikut, auth: true, resource: 'laporan', action: 'read' },
  'laporan.pensiun': { fn: laporanPensiun, auth: true, resource: 'laporan', action: 'read' },
  'laporan.usulan': { fn: laporanUsulan, auth: true, resource: 'laporan', action: 'read' },
  'laporan.pegawaiLengkap': { fn: laporanPegawaiLengkap, auth: true, resource: 'pegawai', action: 'export' },

  /* Diagnosa (halaman Diagnosa di web app) */
  'diag.langkah': { fn: apiDiagLangkah, auth: true, resource: 'laporan', action: 'read' },
  'diag.info': { fn: apiDiagInfo, auth: false },
  'diag.baca': { fn: apiDiagBaca, auth: false },
  'diag.rapikan': { fn: apiRapikanSemuaSheet, auth: true, resource: 'pegawai', action: 'update' }
};

/**
 * Router tunggal. Selalu mengembalikan { success, data | error } —
 * tidak pernah melempar exception ke klien.
 */
function apiCall(action, payload) {
  payload = payload || {};
  var entry = API_REGISTRY[action];
  if (!entry) return fail('Aksi tidak dikenal: ' + action, 'UNKNOWN_ACTION');

  try {
    if (entry.auth !== false) {
      if (typeof entry.authorize === 'function') {
        entry.authorize(payload);
      } else if (entry.resource) {
        authorize(entry.resource, entry.action);
      } else {
        requireUser();
      }
    }
    var hasil = entry.fn(payload);
    return ok(hasil);
  } catch (err) {
    var code = (err && err.appCode) || 'ERROR';
    var msg = (err && err.message) ? err.message : String(err);
    return fail(msg, code);
  }
}

/**
 * Factory otorisasi untuk aksi riwayat: memvalidasi hak akses
 * terhadap resource yang sesuai dengan jenis riwayat pada payload.
 */
function izinkanRiwayat(aksi) {
  return function (payload) {
    var jenis = (payload && payload.jenis) ? payload.jenis : '';
    authorize(riwayatResource(jenis), aksi);
  };
}

/* ------------------------------------------------------------------ */
/* Pembungkus API (memecah payload menjadi parameter fungsi)           */
/* ------------------------------------------------------------------ */

function apiDaftarPegawai(p) {
  return daftarPegawaiLengkap({
    q: p.q, jenis: p.jenis, unit: p.unit, status: p.status,
    limit: p.limit || 100, offset: p.offset || 0
  });
}

function apiDetailPegawai(p) {
  return detailPegawai(p.id);
}

function apiSimpanPegawai(p) {
  var data = clone(p.data || {});
  var hasil = simpanPegawai(data, {});
  flushDashboardCache();
  return hasil;
}

function apiHapusPegawai(p) {
  var hasil = hapusPegawai(p.id);
  flushDashboardCache();
  return hasil;
}

function apiDaftarRiwayat(p) {
  return daftarRiwayat(p.jenis, p.pegawai_id);
}

function apiSimpanRiwayat(p) {
  var hasil = simpanRiwayat(p.jenis, p.data || {});
  flushDashboardCache();
  return hasil;
}

function apiHapusRiwayat(p) {
  var hasil = hapusRiwayat(p.jenis, p.id);
  flushDashboardCache();
  return hasil;
}

function apiMonitoring() {
  return dataMonitoring();
}

/** Diagnosa satu langkah (dipakai halaman Diagnosa di web app). */
function apiDiagLangkah(p) {
  return diagLangkah(p && p.langkah);
}

/** Ukuran/ kondisi setiap sheet (tanpa membaca isi sel). */
function apiDiagInfo() {
  return diagInfoSheet();
}

/** Rapikan seluruh sheet (buang baris/kolom kosong berlebih). */
function apiRapikanSemuaSheet() {
  return rapikanSemuaSheet();
}

/* ------------------------------------------------------------------ */
/* Pembungkus API: Usulan                                               */
/* ------------------------------------------------------------------ */

function apiStatistikUsulan() {
  return statistikUsulan();
}

function apiDaftarUsulan(p) {
  return daftarUsulan(p || {});
}

function apiDetailUsulan(p) {
  return detailUsulan(p.id);
}

function apiSiapkanUsulan(p) {
  return siapkanUsulan(p.pegawai_id, p.jenis);
}

function apiCariPegawaiUsulan(p) {
  return cariPegawaiUntukUsulan(p.q);
}

function apiSimpanUsulan(p) {
  var data = clone(p.data || {});
  var hasil = p.id ? simpanUsulan(Object.assign({ id: p.id }, data)) : simpanUsulan(data);
  return hasil;
}

function apiHapusUsulan(p) {
  return hapusUsulan(p.id);
}

function apiAjukanUsulan(p) {
  return ajukanUsulan(p.id, p.catatan);
}

function apiBatalkanUsulan(p) {
  return batalkanUsulan(p.id, p.alasan);
}

function apiSetujuiUsulan(p) {
  return setujuiUsulan(p.id, p.catatan);
}

function apiTolakUsulan(p) {
  return tolakUsulan(p.id, p.alasan);
}

function apiCetakSk(p) {
  return cetakSk(p.id);
}

/** Uji baca satu sheet dengan batas baris. */
function apiDiagBaca(p) {
  return diagBacaSheet(p && p.nama, p && p.batas ? Number(p.batas) : 0);
}

/**
 * Daftar opsi dropdown dari konfigurasi (untuk form di klien).
 * Key disesuaikan dengan kebutuhan UI (camelCase).
 */
function opsiAplikasi() {
  return {
    jenisPegawai: CONFIG.OPSI_JENIS_PEGAWAI,
    statusPegawai: CONFIG.OPSI_STATUS_PEGAWAI,
    jenisKelamin: CONFIG.OPSI_JENIS_KELAMIN,
    agama: CONFIG.OPSI_AGAMA,
    tingkatPend: CONFIG.OPSI_TINGKAT_PEND,
    gol: CONFIG.OPSI_GOL,
    jenisDokumen: CONFIG.OPSI_JENIS_DOKUMEN,
    jenisUsulan: CONFIG.OPSI_JENIS_USULAN,
    statusUsulan: CONFIG.OPSI_STATUS_USULAN
  };
}

/** Fungsi bantu untuk uji dari editor. */
function testApiList() {
  return JSON.stringify(apiCall('pegawai.list', { limit: 3 }), null, 2);
}
