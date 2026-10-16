/**
 * 30_Pegawai.js
 * Layanan data pegawai: daftar, detail, simpan, hapus — termasuk
 * perakitan "profil lengkap" (riwayat terbaru + turunan seperti umur,
 * masa kerja, perkiraan pensiun).
 */

/** Ambil baris dengan tanggal terbaru dari sekumpulan riwayat. */
function terbaru_(rows, field) {
  if (!rows || !rows.length) return null;
  var best = null, bestVal = -Infinity;
  rows.forEach(function (r) {
    var v = parseDate(r[field]);
    var t = v ? v.getTime() : (r.created_at ? new Date(String(r.created_at).replace(' ', 'T')).getTime() : -Infinity);
    if (t > bestVal) { bestVal = t; best = r; }
  });
  return best;
}

/** Kelompokkan riwayat berdasarkan pegawai_id (sekali baca per tabel). */
function riwayatByPegawai_(namaTabel) {
  var map = {};
  repo(namaTabel).all().forEach(function (r) {
    var k = String(r.pegawai_id || '');
    if (!map[k]) map[k] = [];
    map[k].push(r);
  });
  return map;
}

/**
 * Semua pegawai + riwayat terbaru + nilai turunan.
 * Semua tabel dibaca sekali per pemanggilan (hemat kuota).
 */
function semuaPegawaiLengkap_(acuan) {
  acuan = acuan || new Date();
  var pegawai = repoPegawai().all();
  var mStatus = riwayatByPegawai_('RiwayatStatus');
  var mPangkat = riwayatByPegawai_('RiwayatPangkat');
  var mJabatan = riwayatByPegawai_('RiwayatJabatan');
  var mPend = riwayatByPegawai_('RiwayatPendidikan');
  var mKgb = riwayatByPegawai_('RiwayatKGB');
  var mMasa = riwayatByPegawai_('MasaKerja');

  return pegawai.map(function (p) {
    var id = String(p.id);
    var status = terbaru_(mStatus[id], 'tmt_status');
    var pangkat = terbaru_(mPangkat[id], 'tmt');
    var jabatan = terbaru_(mJabatan[id], 'tmt_tempat_tugas');
    var pend = terbaru_(mPend[id], 'tahun_lulus');
    var kgb = terbaru_(mKgb[id], 'tmt_kgb');
    var masa = terbaru_(mMasa[id], 'tmt_rs_pertama');

    var tmtPertama = masa ? masa.tmt_rs_pertama : '';
    var mk = tmtPertama ? hitungMasaKerja(tmtPertama, acuan) : null;
    var tglPensiun = hitungTanggalPensiun(p, status ? status.jenis_pegawai : '');

    return {
      id: p.id,
      nama: p.nama,
      nik: p.nik || '',
      nip: p.nip || '',
      email: p.email || '',
      nomor_hp: p.nomor_hp || '',
      jenis_kelamin: p.jenis_kelamin || '',
      agama: p.agama || '',
      tempat_lahir: p.tempat_lahir || '',
      tanggal_lahir: p.tanggal_lahir || '',
      umur: hitungUmur(p.tanggal_lahir, acuan),
      link_foto: p.link_foto || '',
      status_pegawai: status ? status.status_pegawai : '',
      tmt_status: status ? status.tmt_status : '',
      jenis_pegawai: status ? status.jenis_pegawai : '',
      gol: pangkat ? pangkat.gol : '',
      gaji_pokok: pangkat ? pangkat.gaji_pokok : '',
      tempat_tugas: jabatan ? jabatan.tempat_tugas : '',
      jabatan: jabatan ? jabatan.jabatan : '',
      tmt_tempat_tugas: jabatan ? jabatan.tmt_tempat_tugas : '',
      tingkat_pend: pend ? pend.tingkat_pend : '',
      jurusan: pend ? pend.jurusan : '',
      tmt_rs_pertama: tmtPertama,
      masa_kerja: mk ? mk.teks : '',
      tmt_kgb_terakhir: kgb ? kgb.tmt_kgb : '',
      tanggal_pensiun: tglPensiun ? formatDate(tglPensiun) : '',
      catatan: p.catatan || ''
    };
  });
}

/**
 * Versi RINGKAS untuk daftar pegawai: hanya membaca 3 tabel yang
 * benar-benar dibutuhkan (Pegawai, RiwayatStatus, RiwayatJabatan) —
 * jauh lebih cepat daripada profil lengkap yang membaca 7 tabel.
 */
function semuaPegawaiRingkas_() {
  var pegawai = repoPegawai().all();
  var mStatus = riwayatByPegawai_('RiwayatStatus');
  var mJabatan = riwayatByPegawai_('RiwayatJabatan');

  return pegawai.map(function (p) {
    var id = String(p.id);
    var status = terbaru_(mStatus[id], 'tmt_status');
    var jab = terbaru_(mJabatan[id], 'tmt_tempat_tugas');
    return {
      id: p.id,
      nama: p.nama,
      nik: p.nik || '',
      nip: p.nip || '',
      status_pegawai: status ? status.status_pegawai : '',
      jenis_pegawai: status ? status.jenis_pegawai : '',
      tempat_tugas: jab ? jab.tempat_tugas : '',
      jabatan: jab ? jab.jabatan : ''
    };
  });
}

/** Daftar pegawai dengan filter, untuk tabel & pencarian. */
function daftarPegawaiLengkap(filter) {
  filter = filter || {};
  var semua = semuaPegawaiRingkas_();
  var q = String(filter.q || '').trim().toLowerCase();
  var out = semua.filter(function (p) {
    if (filter.jenis && filter.jenis !== 'SEMUA' && p.jenis_pegawai !== filter.jenis) return false;
    if (filter.unit && filter.unit !== 'SEMUA' && p.tempat_tugas !== filter.unit) return false;
    if (filter.status && filter.status !== 'SEMUA' && p.status_pegawai !== filter.status) return false;
    if (q) {
      var cocok = String(p.nama).toLowerCase().indexOf(q) > -1 ||
        String(p.id).toLowerCase().indexOf(q) > -1 ||
        String(p.nip).toLowerCase().indexOf(q) > -1;
      if (!cocok) return false;
    }
    return true;
  });
  out.sort(function (a, b) { return String(a.nama).localeCompare(String(b.nama)); });
  var total = out.length;
  var limit = filter.limit || 100;
  var offset = filter.offset || 0;
  return {
    total: total,
    rows: out.slice(offset, offset + limit),
    filter: { q: q, jenis: filter.jenis || 'SEMUA', unit: filter.unit || 'SEMUA', status: filter.status || 'SEMUA' }
  };
}

/** Detail satu pegawai: biodata + seluruh riwayat (urut terbaru) + dokumen. */
function detailPegawai(id) {
  var idStr = String(id || '').trim();
  if (!idStr) throw AppError('ID pegawai wajib diisi.', 'VALIDASI');
  var p = repoPegawai().byId(idStr);
  if (!p) throw AppError('Pegawai dengan ID "' + idStr + '" tidak ditemukan.', 'NOT_FOUND');

  var status = repoRiwayatStatus().where({ pegawai_id: idStr });
  var pend = repoRiwayatPendidikan().where({ pegawai_id: idStr });
  var pangkat = repoRiwayatPangkat().where({ pegawai_id: idStr });
  var jabatan = repoRiwayatJabatan().where({ pegawai_id: idStr });
  var kgb = repoRiwayatKGB().where({ pegawai_id: idStr });
  var dokumen = repoDokumen().where({ pegawai_id: idStr });
  var masa = repoMasaKerja().where({ pegawai_id: idStr });

  var sortTurun = function (a, b) { return String(b.created_at || '').localeCompare(String(a.created_at || '')); };
  [status, pend, pangkat, jabatan, kgb, dokumen].forEach(function (arr) { arr.sort(sortTurun); });

  var mk = masa.length ? hitungMasaKerja(masa[0].tmt_rs_pertama) : null;
  var tglPensiun = hitungTanggalPensiun(p, terbaru_(status, 'tmt_status') ? terbaru_(status, 'tmt_status').jenis_pegawai : '');

  return {
    pegawai: p,
    ringkas: {
      status: terbaru_(status, 'tmt_status'),
      pangkat: terbaru_(pangkat, 'tmt'),
      jabatan: terbaru_(jabatan, 'tmt_tempat_tugas'),
      pendidikan: terbaru_(pend, 'tahun_lulus'),
      kgb: terbaru_(kgb, 'tmt_kgb'),
      umur: hitungUmur(p.tanggal_lahir),
      masa_kerja: mk ? mk.teks : '',
      tanggal_pensiun: tglPensiun ? formatDate(tglPensiun) : ''
    },
    riwayat: {
      status: status, pendidikan: pend, pangkat: pangkat,
      jabatan: jabatan, kgb: kgb
    },
    dokumen: dokumen,
    masaKerja: masa
  };
}

/**
 * Simpan (tambah/ubah) biodata pegawai.
 * payload: field Pegawai; opsi.uuidId menentukan tambah vs ubah.
 */
function simpanPegawai(payload, opsi) {
  opsi = opsi || {};
  return withLock(function () {
    var idBaru = String(payload.id || '').trim();
    if (!idBaru) throw AppError('ID Absen wajib diisi.', 'VALIDASI');

    var sebelum = repoPegawai().byId(idBaru);
    var isBaru = !sebelum;

    // Normalisasi ringan sebelum simpan
    var data = clone(payload);
    if (data.email) data.email = normalisasiEmail(data.email);
    if (data.nomor_hp) data.nomor_hp = normalisasiHp(data.nomor_hp);

    var hasil;
    if (isBaru) {
      hasil = repoPegawai().insert(data);
      catatLog('CREATE', 'Pegawai', hasil.id, 'Tambah pegawai: ' + hasil.nama, null, hasil);
    } else {
      hasil = repoPegawai().update(idBaru, data);
      catatLog('UPDATE', 'Pegawai', idBaru, 'Ubah pegawai: ' + (hasil.nama || ''), sebelum, hasil);
    }
    return hasil;
  });
}

/** Hapus pegawai beserta seluruh riwayat & dokumennya. */
function hapusPegawai(id) {
  return withLock(function () {
    var idStr = String(id || '').trim();
    var p = repoPegawai().byId(idStr);
    if (!p) throw AppError('Pegawai tidak ditemukan.', 'NOT_FOUND');

    ['RiwayatStatus', 'RiwayatPendidikan', 'RiwayatPangkat', 'RiwayatJabatan',
     'RiwayatKGB', 'Dokumen', 'MasaKerja'].forEach(function (tabel) {
      repo(tabel).where({ pegawai_id: idStr }).forEach(function (r) {
        repo(tabel).remove(r.id);
      });
    });
    repoPegawai().remove(idStr);
    catatLog('DELETE', 'Pegawai', idStr, 'Hapus pegawai: ' + p.nama, p, null);
    return { ok: true };
  });
}

/** Opsi untuk dropdown filter (jenis pegawai, unit, status). */
function opsiFilterPegawai() {
  // Hanya 2 tabel yang dibutuhkan — jangan pakai profil lengkap.
  var mStatus = riwayatByPegawai_('RiwayatStatus');
  var mJabatan = riwayatByPegawai_('RiwayatJabatan');

  function unikDari(map, field) {
    var s = {};
    Object.keys(map).forEach(function (id) {
      var terbaru = terbaru_(map[id], field === 'tempat_tugas' ? 'tmt_tempat_tugas' : 'tmt_status');
      var v = terbaru ? String(terbaru[field] || '').trim() : '';
      if (v) s[v] = true;
    });
    return Object.keys(s).sort();
  }

  return {
    jenis: unikDari(mStatus, 'jenis_pegawai'),
    unit: unikDari(mJabatan, 'tempat_tugas'),
    status: unikDari(mStatus, 'status_pegawai')
  };
}

/** Foto pegawai: ubah link share Drive menjadi URL langsung. */
function fotoPegawaiUrl(id) {
  var p = repoPegawai().byId(String(id || ''));
  if (!p || !p.link_foto) return '';
  var m = String(p.link_foto).match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? 'https://drive.google.com/uc?export=view&id=' + m[1] : String(p.link_foto);
}
