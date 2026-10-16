/**
 * 51_Usulan.js
 * Usulan Kenaikan Pangkat (KP) dan Kenaikan Gaji Berkala (KGB).
 *
 * Alur:
 *   DRAFT → DIAJUKAN → DISETUJUI / DITOLAK
 *                     ↘ DIBATALKAN (dari DRAFT/DIAJUKAN)
 *
 * Setiap perubahan dicatat di sheet UsulanRiwayat + audit log, sehingga
 * jelas siapa yang mengajukan dan siapa yang memutuskan.
 *
 * Catatan: aplikasi lama tidak punya tabel gaji, jadi gaji pokok baru
 * untuk KP diisi manual oleh operator (angka terbaru dari SK). Semua
 * perhitungan lain (TMT, golongan berikutnya, masa kerja) otomatis.
 */

/** Nomor usulan otomatis: urutan per tahun, mis. "005/KP.RSUD/2026". */
function nomorUsulanBaru(jenis) {
  var tahun = new Date().getFullYear();
  var kode = jenis === 'KP' ? 'KP.RSUD' : 'KGB.RSUD';
  var jumlah = repoUsulan().all().filter(function (u) {
    return u.jenis === jenis && String(u.nomor_usulan || '').indexOf('/' + tahun) > -1;
  }).length;
  var urut = pad(jumlah + 1, 3);
  return urut + '/' + kode + '/' + tahun;
}

/**
 * Golongan berikutnya dalam urutan pangkat:
 * I/a → I/b → I/c → I/d → II/a → … → IV/e
 * Golongan yang tidak dikenal dikembalikan apa adanya.
 */
function golonganBerikutnya(gol) {
  var urutan = CONFIG.OPSI_GOL;
  var idx = -1;
  for (var i = 0; i < urutan.length; i++) {
    if (String(urutan[i]).trim().toLowerCase() === String(gol || '').trim().toLowerCase()) { idx = i; break; }
  }
  if (idx < 0) return { berikut: '', ketemu: false };
  if (idx + 1 >= urutan.length) return { berikut: '', ketemu: true, puncak: true };
  return { berikut: urutan[idx + 1], ketemu: true };
}

/**
 * Menyiapkan data usulan (draft) dari riwayat pegawai — dipakai form
 * "Buat Usulan" supaya operator tidak perlu mengisi ulang manual.
 */
function siapkanUsulan(pegawaiId, jenis) {
  var id = String(pegawaiId || '').trim();
  if (!id) throw AppError('ID Pegawai wajib diisi.', 'VALIDASI');
  var p = repoPegawai().byId(id);
  if (!p) throw AppError('Pegawai dengan ID "' + id + '" tidak ditemukan.', 'NOT_FOUND');

  var mStatus = riwayatByPegawai_('RiwayatStatus');
  var mPangkat = riwayatByPegawai_('RiwayatPangkat');
  var mKgb = riwayatByPegawai_('RiwayatKGB');
  var mMasa = riwayatByPegawai_('MasaKerja');

  var status = terbaru_(mStatus[id], 'tmt_status');
  var pangkat = terbaru_(mPangkat[id], 'tmt');
  var kgb = terbaru_(mKgb[id], 'tmt_kgb');
  var masa = terbaru_(mMasa[id], 'tmt_rs_pertama');

  var dasar = {
    pegawai_id: id,
    nama: p.nama,
    jenis_pegawai: status ? status.jenis_pegawai : '',
    tempat_tugas: '',
    jabatan: '',
    golongan_lama: pangkat ? pangkat.gol : '',
    gaji_lama: pangkat && pangkat.gaji_pokok ? pangkat.gaji_pokok : '',
    tmt_kgb_terakhir: kgb ? kgb.tmt_kgb : ''
  };

  // jabatan/unit terakhir
  var mJab = riwayatByPegawai_('RiwayatJabatan');
  var jab = terbaru_(mJab[id], 'tmt_tempat_tugas');
  if (jab) { dasar.tempat_tugas = jab.tempat_tugas || ''; dasar.jabatan = jab.jabatan || ''; }

  var mk = masa && masa.tmt_rs_pertama ? hitungMasaKerja(masa.tmt_rs_pertama) : null;
  dasar.masa_kerja = mk ? mk.teks : '';
  dasar.tmt_rs_pertama = masa ? masa.tmt_rs_pertama : '';

  if (jenis === 'KP') {
    var berikut = golonganBerikutnya(dasar.golongan_lama);
    var catatan = [];
    if (!pangkat) catatan.push('Pegawai belum punya riwayat pangkat.');
    if (berikut.puncak) catatan.push('Sudah di golongan tertinggi (IV/e).');
    else if (!berikut.ketemu) catatan.push('Golongan lama "' + (dasar.golongan_lama || '(kosong)') + '" tidak dikenali — golongan berikutnya harus diisi manual.');
    else if (mk && mk.tahun < 1) catatan.push('Masa kerja baru ' + mk.teks + ' — syarat KP umumnya minimal 1 tahun.');
    else if (berikut.error) catatan.push(berikut.error);

    dasar.golongan_baru = berikut.berikut || '';
    dasar.periode_tmt = '';
    dasar.catatan = catatan.join(' ');
    dasar.gaji_baru = '';
  } else {
    var tmt = kgb && kgb.tmt_kgb ? kgb.tmt_kgb : '';
    var berikutKgb = null;
    if (tmt) {
      var d = parseDate(tmt);
      if (d) {
        berikutKgb = new Date(d.getFullYear() + 2, d.getMonth(), d.getDate());
      }
    }
    dasar.periode_tmt = berikutKgb ? formatDate(berikutKgb) : '';
    dasar.catatan = berikutKgb
      ? 'KGB berikutnya: TMT ' + formatDate(berikutKgb) + ' (2 tahun setelah KGB terakhir ' + tmt + ').'
      : 'Belum ada riwayat KGB — tanggal TMT usulan harus diisi manual.';
    dasar.golongan_baru = dasar.golongan_lama;
    dasar.gaji_baru = '';
  }

  return dasar;
}

/** Daftar usulan (filter status/jenis, plus nama pegawai). */
function daftarUsulan(filter) {
  filter = filter || {};
  var rows = repoUsulan().all();

  // peta nama pegawai sekali baca
  var namaPeg = {};
  repoPegawai().all().forEach(function (p) { namaPeg[String(p.id)] = p.nama; });

  var out = rows.filter(function (u) {
    if (filter.jenis && filter.jenis !== 'SEMUA' && u.jenis !== filter.jenis) return false;
    if (filter.status && filter.status !== 'SEMUA' && u.status !== filter.status) return false;
    if (filter.q) {
      var q = String(filter.q).toLowerCase();
      var cocok = String(u.nomor_usulan || '').toLowerCase().indexOf(q) > -1 ||
        String(namaPeg[String(u.pegawai_id)] || '').toLowerCase().indexOf(q) > -1 ||
        String(u.pegawai_id || '').toLowerCase().indexOf(q) > -1;
      if (!cocok) return false;
    }
    return true;
  });

  out.sort(function (a, b) { return String(b.created_at || '').localeCompare(String(a.created_at || '')); });

  return out.map(function (u) {
    return {
      id: u.id,
      nomor_usulan: u.nomor_usulan,
      jenis: u.jenis,
      status: u.status,
      pegawai_id: u.pegawai_id,
      nama: namaPeg[String(u.pegawai_id)] || '(tak dikenal)',
      golongan_lama: u.golongan_lama || '',
      golongan_baru: u.golongan_baru || '',
      periode_tmt: u.periode_tmt || '',
      gaji_lama: u.gaji_lama || '',
      gaji_baru: u.gaji_baru || '',
      diajukan_oleh: u.diajukan_oleh || '',
      diajukan_at: u.diajukan_at || '',
      diputuskan_oleh: u.diputuskan_oleh || '',
      diputuskan_at: u.diputuskan_at || '',
      file_sk_url: u.file_sk_url || '',
      created_at: u.created_at
    };
  });
}

/** Detail usulan + riwayat tindakan + data pegawai pendukung. */
function detailUsulan(id) {
  var u = repoUsulan().byId(String(id || ''));
  if (!u) throw AppError('Usulan tidak ditemukan.', 'NOT_FOUND');

  var riwayat = repoUsulanRiwayat().where({ usulan_id: u.id });
  riwayat.sort(function (a, b) { return String(a.waktu || '').localeCompare(String(b.waktu || '')); });

  var p = repoPegawai().byId(String(u.pegawai_id || ''));
  var pendukung = null;
  if (p) {
    var ringkas = semuaPegawaiRingkas_().filter(function (x) { return String(x.id) === String(p.id); })[0] || null;
    pendukung = {
      pegawai: p,
      status: ringkas ? ringkas.status_pegawai : '',
      jenis_pegawai: ringkas ? ringkas.jenis_pegawai : '',
      tempat_tugas: ringkas ? ringkas.tempat_tugas : '',
      jabatan: ringkas ? ringkas.jabatan : '',
      umur: hitungUmur(p.tanggal_lahir)
    };
  }

  return { usulan: u, riwayat: riwayat, pendukung: pendukung };
}

/** Hitung statistik usulan untuk badge. */
function statistikUsulan() {
  var rows = repoUsulan().all();
  var c = {};
  rows.forEach(function (u) { c[u.status] = (c[u.status] || 0) + 1; });
  c.total = rows.length;
  return c;
}

/**
 * Simpan usulan (tambah bila tanpa id, ubah bila ada id).
 * payload: field Usulan; wajib pegawai_id & jenis.
 */
function simpanUsulan(payload) {
  return withLock(function () {
    var data = clone(payload || {});
    var idBaru = String(data.pegawai_id || '').trim();
    if (!idBaru) throw AppError('ID Pegawai wajib diisi.', 'VALIDASI');
    if (!data.jenis) throw AppError('Jenis usulan wajib dipilih.', 'VALIDASI');
    if (!repoPegawai().byId(idBaru)) {
      throw AppError('Pegawai dengan ID "' + idBaru + '" tidak ditemukan.', 'NOT_FOUND');
    }
    if (!data.periode_tmt && data.jenis) {
      data.periode_tmt = siapkanUsulan(idBaru, data.jenis).periode_tmt;
    }
    if (data.gaji_lama === '' || data.gaji_lama === undefined) data.gaji_lama = 0;
    if (data.gaji_baru === '' || data.gaji_baru === undefined) data.gaji_baru = 0;

    var hasil, sebelum = null;
    if (data.id) {
      sebelum = repoUsulan().byId(data.id);
      if (!sebelum) throw AppError('Usulan tidak ditemukan.', 'NOT_FOUND');
      if (sebelum.status !== 'DRAFT') {
        throw AppError('Usulan yang sudah diajukan/diputuskan tidak dapat diubah.', 'STATUS_TIDAK_BENAR');
      }
      hasil = repoUsulan().update(data.id, data);
      catatLog('UPDATE', 'Usulan', hasil.id, 'Ubah usulan ' + hasil.nomor_usulan, sebelum, hasil);
      catatRiwayatUsulan(hasil.id, 'UBAH', 'Usulan diperbarui', sebelum, hasil);
    } else {
      delete data.id;
      data.nomor_usulan = data.nomor_usulan || nomorUsulanBaru(data.jenis);
      if (!data.status) data.status = 'DRAFT';
      hasil = repoUsulan().insert(data);
      catatLog('CREATE', 'Usulan', hasil.id, 'Buat usulan ' + hasil.nomor_usulan, null, hasil);
      catatRiwayatUsulan(hasil.id, 'BUAT', 'Usulan dibuat (' + hasil.jenis + ')', null, hasil);
    }
    return hasil;
  });
}

/** Catat satu langkah pada UsulanRiwayat. */
function catatRiwayatUsulan(usulanId, aksi, catatan, sebelum, sesudah) {
  var u = null;
  try { u = getCurrentUser(); } catch (e) { /* belum login */ }
  return repoUsulanRiwayat().insert({
    usulan_id: String(usulanId),
    aksi: String(aksi || '').toUpperCase(),
    user_id: u ? u.id : '',
    user_nama: u ? u.nama : 'Sistem',
    waktu: nowIso(),
    catatan: catatan || '',
    data_lama: sebelum ? JSON.stringify(sebelum) : '',
    data_baru: sesudah ? JSON.stringify(sesudah) : ''
  });
}

/** DRAFT → DIAJUKAN */
function ajukanUsulan(id, catatan) {
  return withLock(function () {
    var u = repoUsulan().byId(String(id || ''));
    if (!u) throw AppError('Usulan tidak ditemukan.', 'NOT_FOUND');
    if (u.status !== 'DRAFT') {
      throw AppError('Hanya usulan berstatus DRAFT yang bisa diajukan.', 'STATUS_TIDAK_BENAR');
    }
    var user = requireUser();
    var hasil = repoUsulan().update(u.id, {
      status: 'DIAJUKAN',
      diajukan_oleh: user.nama || user.email || '',
      diajukan_at: nowIso()
    });
    catatLog('SUBMIT', 'Usulan', hasil.id, 'Ajukan usulan ' + hasil.nomor_usulan, u, hasil);
    catatRiwayatUsulan(hasil.id, 'DIAJUKAN', catatan || '', u, hasil);
    return hasil;
  });
}

/** DIAJUKAN → DISETUJUI */
function setujuiUsulan(id, catatan) {
  return withLock(function () {
    var u = repoUsulan().byId(String(id || ''));
    if (!u) throw AppError('Usulan tidak ditemukan.', 'NOT_FOUND');
    if (u.status !== 'DIAJUKAN') {
      throw AppError('Hanya usulan yang sudah DIAJUKAN yang bisa disetujui.', 'STATUS_TIDAK_BENAR');
    }
    var user = requireUser();
    var hasil = repoUsulan().update(u.id, {
      status: 'DISETUJUI',
      diputuskan_oleh: user.nama || user.email || '',
      diputuskan_at: nowIso(),
      alasan_keputusan: catatan || 'Disetujui'
    });
    catatLog('APPROVE', 'Usulan', hasil.id, 'Setujui usulan ' + hasil.nomor_usulan, u, hasil);
    catatRiwayatUsulan(hasil.id, 'DISETUJUI', catatan || '', u, hasil);
    return hasil;
  });
}

/** DIAJUKAN → DITOLAK */
function tolakUsulan(id, alasan) {
  return withLock(function () {
    var u = repoUsulan().byId(String(id || ''));
    if (!u) throw AppError('Usulan tidak ditemukan.', 'NOT_FOUND');
    if (u.status !== 'DIAJUKAN') {
      throw AppError('Hanya usulan yang sudah DIAJUKAN yang bisa ditolak.', 'STATUS_TIDAK_BENAR');
    }
    if (!String(alasan || '').trim()) {
      throw AppError('Alasan penolakan wajib diisi.', 'VALIDASI');
    }
    var user = requireUser();
    var hasil = repoUsulan().update(u.id, {
      status: 'DITOLAK',
      diputuskan_oleh: user.nama || user.email || '',
      diputuskan_at: nowIso(),
      alasan_keputusan: alasan
    });
    catatLog('REJECT', 'Usulan', hasil.id, 'Tolak usulan ' + hasil.nomor_usulan, u, hasil);
    catatRiwayatUsulan(hasil.id, 'DITOLAK', alasan, u, hasil);
    return hasil;
  });
}

/** DRAFT/DIAJUKAN → DIBATALKAN */
function batalkanUsulan(id, alasan) {
  return withLock(function () {
    var u = repoUsulan().byId(String(id || ''));
    if (!u) throw AppError('Usulan tidak ditemukan.', 'NOT_FOUND');
    if (u.status !== 'DRAFT' && u.status !== 'DIAJUKAN') {
      throw AppError('Usulan dengan status ' + u.status + ' tidak dapat dibatalkan.', 'STATUS_TIDAK_BENAR');
    }
    var hasil = repoUsulan().update(u.id, { status: 'DIBATALKAN' });
    catatLog('CANCEL', 'Usulan', hasil.id, 'Batalkan usulan ' + hasil.nomor_usulan, u, hasil);
    catatRiwayatUsulan(hasil.id, 'DIBATALKAN', alasan || '', u, hasil);
    return hasil;
  });
}

/** Hapus usulan (hanya DRAFT/DITOLAK/DIBATALKAN). */
function hapusUsulan(id) {
  return withLock(function () {
    var u = repoUsulan().byId(String(id || ''));
    if (!u) throw AppError('Usulan tidak ditemukan.', 'NOT_FOUND');
    if (u.status === 'DIAJUKAN' || u.status === 'DISETUJUI') {
      throw AppError('Usulan yang sedang diajukan atau sudah disetujui tidak boleh dihapus.', 'STATUS_TIDAK_BENAR');
    }
    repoUsulanRiwayat().where({ usulan_id: u.id }).forEach(function (r) {
      repoUsulanRiwayat().remove(r.id);
    });
    repoUsulan().remove(u.id);
    catatLog('DELETE', 'Usulan', u.id, 'Hapus usulan ' + u.nomor_usulan, u, null);
    return { ok: true };
  });
}

/** Daftar pegawai + golongan terkini untuk pencarian di form usulan. */
function cariPegawaiUntukUsulan(q) {
  var semua = semuaPegawaiRingkas_();
  var teks = String(q || '').trim().toLowerCase();
  var out = semua.filter(function (p) {
    if (!teks) return true;
    return String(p.nama).toLowerCase().indexOf(teks) > -1 ||
      String(p.id).toLowerCase().indexOf(teks) > -1 ||
      String(p.nip || '').toLowerCase().indexOf(teks) > -1;
  });
  out.sort(function (a, b) { return String(a.nama).localeCompare(String(b.nama)); });
  return out.slice(0, 25).map(function (p) {
    return { id: p.id, nama: p.nama, jenis: p.jenis_pegawai, status: p.status_pegawai };
  });
}
