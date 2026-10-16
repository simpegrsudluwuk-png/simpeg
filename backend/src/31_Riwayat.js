/**
 * 31_Riwayat.js
 * CRUD riwayat pegawai: status, pendidikan, pangkat, jabatan, KGB.
 * Setiap perubahan tercatat di audit log.
 */

var JENIS_RIWAYAT = {
  status: { tabel: 'RiwayatStatus', label: 'Status Kepegawaian', resource: 'riwayat_status' },
  pendidikan: { tabel: 'RiwayatPendidikan', label: 'Pendidikan', resource: 'riwayat_pendidikan' },
  pangkat: { tabel: 'RiwayatPangkat', label: 'Pangkat / Golongan', resource: 'riwayat_pangkat' },
  jabatan: { tabel: 'RiwayatJabatan', label: 'Jabatan / Tempat Tugas', resource: 'riwayat_jabatan' },
  kgb: { tabel: 'RiwayatKGB', label: 'Kenaikan Gaji Berkala', resource: 'riwayat_kgb' }
};

function riwayatConfig(jenis) {
  var cfg = JENIS_RIWAYAT[jenis];
  if (!cfg) throw AppError('Jenis riwayat tidak dikenal: ' + jenis, 'VALIDASI');
  return cfg;
}

/** Nama resource hak akses untuk sebuah jenis riwayat. */
function riwayatResource(jenis) {
  var cfg = JENIS_RIWAYAT[jenis];
  if (!cfg) throw AppError('Jenis riwayat tidak dikenal: ' + jenis, 'VALIDASI');
  return cfg.resource;
}

/** Daftar riwayat satu pegawai (terbaru dulu). */
function daftarRiwayat(jenis, pegawaiId) {
  var cfg = riwayatConfig(jenis);
  var rows = repo(cfg.tabel).where({ pegawai_id: String(pegawaiId || '') });
  rows.sort(function (a, b) { return String(b.created_at || '').localeCompare(String(a.created_at || '')); });
  return rows;
}

/**
 * Simpan riwayat (tambah bila tanpa id, ubah bila ada id).
 * payload harus memuat pegawai_id; jenis salah satu kunci JENIS_RIWAYAT.
 */
function simpanRiwayat(jenis, payload) {
  var cfg = riwayatConfig(jenis);
  return withLock(function () {
    var id = String(payload.pegawai_id || '').trim();
    if (!id) throw AppError('ID Pegawai wajib diisi.', 'VALIDASI');
    var pegawai = repoPegawai().byId(id);
    if (!pegawai) throw AppError('Pegawai dengan ID "' + id + '" tidak ditemukan.', 'NOT_FOUND');

    var data = clone(payload);
    delete data.id;

    var hasil;
    if (payload.id) {
      var sebelum = repo(cfg.tabel).byId(payload.id);
      if (!sebelum) throw AppError('Riwayat tidak ditemukan.', 'NOT_FOUND');
      hasil = repo(cfg.tabel).update(payload.id, data);
      catatLog('UPDATE', cfg.tabel, payload.id,
        'Ubah riwayat ' + cfg.label + ' untuk ' + pegawai.nama, sebelum, hasil);
    } else {
      hasil = repo(cfg.tabel).insert(data);
      catatLog('CREATE', cfg.tabel, hasil.id,
        'Tambah riwayat ' + cfg.label + ' untuk ' + pegawai.nama, null, hasil);
    }
    return hasil;
  });
}

/** Hapus satu baris riwayat. */
function hapusRiwayat(jenis, id) {
  var cfg = riwayatConfig(jenis);
  return withLock(function () {
    var row = repo(cfg.tabel).byId(String(id || ''));
    if (!row) throw AppError('Riwayat tidak ditemukan.', 'NOT_FOUND');
    var pegawai = repoPegawai().byId(String(row.pegawai_id || ''));
    repo(cfg.tabel).remove(row.id);
    catatLog('DELETE', cfg.tabel, row.id,
      'Hapus riwayat ' + cfg.label + ' untuk ' + (pegawai ? pegawai.nama : row.pegawai_id), row, null);
    return { ok: true };
  });
}

/** Daftar opsi masa kerja (TMT RS pertama) satu pegawai. */
function masaKerjaPegawai(pegawaiId) {
  var rows = repoMasaKerja().where({ pegawai_id: String(pegawaiId || '') });
  rows.sort(function (a, b) { return String(b.tmt_rs_pertama || '').localeCompare(String(a.tmt_rs_pertama || '')); });
  return rows;
}

/** Simpan/ubah masa kerja (1 baris per pegawai). */
function simpanMasaKerja(pegawaiId, payload) {
  return withLock(function () {
    var id = String(pegawaiId || '').trim();
    if (!repoPegawai().byId(id)) throw AppError('Pegawai tidak ditemukan.', 'NOT_FOUND');
    var data = clone(payload);
    data.pegawai_id = id;

    var ada = repoMasaKerja().first({ pegawai_id: id });
    var hasil;
    if (ada) {
      var sebelum = ada;
      hasil = repoMasaKerja().update(ada.id, data);
      catatLog('UPDATE', 'MasaKerja', ada.id, 'Ubah masa kerja pegawai ' + id, sebelum, hasil);
    } else {
      hasil = repoMasaKerja().insert(data);
      catatLog('CREATE', 'MasaKerja', hasil.id, 'Tambah masa kerja pegawai ' + id, null, hasil);
    }
    return hasil;
  });
}

/** Ambil satu baris riwayat untuk form edit. */
function ambilRiwayat(jenis, id) {
  var cfg = riwayatConfig(jenis);
  var row = repo(cfg.tabel).byId(String(id || ''));
  if (!row) throw AppError('Riwayat tidak ditemukan.', 'NOT_FOUND');
  return row;
}
