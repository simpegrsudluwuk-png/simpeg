/**
 * 53_Laporan.js
 * Laporan rekap untuk Subbag Kepegawaian & pimpinan:
 *   - Rekap per unit kerja × jenis pegawai
 *   - Rekap golongan/ruang
 *   - Jadwal KGB berikutnya
 *   - Daftar pegawai mendekati pensiun
 *   - Rekap usulan (KP/KGB) per status
 *
 * Semua laporan mengembalikan data mentah (bukan HTML) supaya klien
 * bebas menampilkannya sebagai tabel, mencetak PDF, atau mengunduh CSV.
 */

/** Rekap jumlah pegawai per unit kerja × jenis pegawai. */
function laporanRekapUnit() {
  var semua = semuaPegawaiRingkas_();
  var unitMap = {};

  semua.forEach(function (p) {
    var unit = p.tempat_tugas || '(Tanpa Unit)';
    var jenis = p.jenis_pegawai || '(Tanpa Jenis)';
    if (!unitMap[unit]) unitMap[unit] = { unit: unit, total: 0, jenis: {} };
    unitMap[unit].total++;
    unitMap[unit].jenis[jenis] = (unitMap[unit].jenis[jenis] || 0) + 1;
  });

  var daftarUnit = repoUnits().all().map(function (u) { return u.nama; });
  var rows = Object.keys(unitMap).map(function (k) { return unitMap[k]; });
  rows.sort(function (a, b) {
    var ia = daftarUnit.indexOf(a.unit), ib = daftarUnit.indexOf(b.unit);
    if (ia !== ib) return (ia === -1 ? 9999 : ia) - (ib === -1 ? 9999 : ib);
    return b.total - a.total;
  });

  var semuaJenis = [];
  semua.forEach(function (p) {
    var j = p.jenis_pegawai || '(Tanpa Jenis)';
    if (semuaJenis.indexOf(j) === -1) semuaJenis.push(j);
  });
  semuaJenis.sort();

  return {
    kolomJenis: semuaJenis,
    rows: rows,
    total: semua.length
  };
}

/** Rekap distribusi golongan/ruang. */
function laporanGolongan() {
  var mPangkat = riwayatByPegawai_('RiwayatPangkat');
  var mStatus = riwayatByPegawai_('RiwayatStatus');
  var namaPeg = {};
  repoPegawai().all().forEach(function (p) { namaPeg[String(p.id)] = p.nama; });

  var perGol = {};
  var rows = [];
  Object.keys(mPangkat).forEach(function (pid) {
    var g = terbaru_(mPangkat[pid], 'tmt');
    if (!g || !String(g.gol || '').trim()) return;
    var gol = String(g.gol).trim();
    if (!perGol[gol]) {
      perGol[gol] = { gol: gol, jumlah: 0, gajiMin: null, gajiMax: null, pegawai: [] };
    }
    var b = perGol[gol];
    b.jumlah++;
    var gaji = Number(g.gaji_pokok) || 0;
    if (gaji > 0) {
      if (b.gajiMin === null || gaji < b.gajiMin) b.gajiMin = gaji;
      if (b.gajiMax === null || gaji > b.gajiMax) b.gajiMax = gaji;
    }
    if (b.pegawai.length < 5) b.pegawai.push(namaPeg[pid] || pid);
  });

  rows = Object.keys(perGol).map(function (k) { return perGol[k]; });
  var urut = CONFIG.OPSI_GOL;
  rows.sort(function (a, b) {
    var ia = urut.indexOf(a.gol), ib = urut.indexOf(b.gol);
    if (ia !== ib) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a.gol.localeCompare(b.gol);
  });

  var totalBerGaji = rows.reduce(function (t, r) { return t + (r.gajiMin ? r.jumlah : 0); }, 0);
  return {
    rows: rows,
    totalBerGolongan: rows.reduce(function (t, r) { return t + r.jumlah; }, 0),
    totalBerGajiPokok: totalBerGaji
  };
}

/** Jadwal KGB berikutnya (urut TMT) untuk laporan/persetujuan. */
function laporanKgbBerikut() {
  var mKgb = riwayatByPegawai_('RiwayatKGB');
  var ringkasMap = {};
  semuaPegawaiRingkas_().forEach(function (x) { ringkasMap[String(x.id)] = x; });

  var rows = [];
  Object.keys(mKgb).forEach(function (pid) {
    var terakhir = terbaru_(mKgb[pid], 'tmt_kgb');
    if (!terakhir || !terakhir.tmt_kgb) return;
    var d = parseDate(terakhir.tmt_kgb);
    if (!d) return;
    var berikut = new Date(d.getFullYear() + 2, d.getMonth(), d.getDate());
    var ringkas = ringkasMap[String(pid)] || null;
    rows.push({
      pegawai_id: pid,
      nama: ringkas ? ringkas.nama : pid,
      unit: ringkas ? ringkas.tempat_tugas : '',
      jenis: ringkas ? ringkas.jenis_pegawai : '',
      golongan: terakhir.gol || (ringkas && ringkas.gol) || '',
      tmt_terakhir: terakhir.tmt_kgb,
      tmt_berikut: formatDate(berikut),
      sisa_hari: diffDays(new Date(), berikut)
    });
  });
  rows.sort(function (a, b) { return a.tmt_berikut.localeCompare(b.tmt_berikut); });
  return { rows: rows };
}

/** Pegawai mendekati pensiun (DHT). */
function laporanPensiun() {
  var semua = semuaPegawaiLengkap_();
  var rows = semua.filter(function (p) { return p.tanggal_pensiun; });
  rows.sort(function (a, b) { return a.tanggal_pensiun.localeCompare(b.tanggal_pensiun); });
  return {
    rows: rows.map(function (p) {
      return {
        pegawai_id: p.id,
        nama: p.nama,
        unit: p.tempat_tugas,
        jabatan: p.jabatan,
        jenis: p.jenis_pegawai,
        golongan: p.gol,
        tanggal_lahir: p.tanggal_lahir,
        umur: p.umur,
        tanggal_pensiun: p.tanggal_pensiun,
        sisa_hari: diffDays(new Date(), parseDate(p.tanggal_pensiun))
      };
    })
  };
}

/** Rekap usulan per status & jenis. */
function laporanUsulan() {
  var rows = daftarUsulan({});
  var perStatus = {}, perJenis = {};
  rows.forEach(function (u) {
    perStatus[u.status] = (perStatus[u.status] || 0) + 1;
    perJenis[u.jenis] = (perJenis[u.jenis] || 0) + 1;
  });
  return {
    rows: rows,
    perStatus: perStatus,
    perJenis: perJenis,
    total: rows.length
  };
}

/**
 * Data lengkap pegawai untuk ekspor (semua baris, tanpa batas 50).
 * Dipakai tombol "Ekspor Excel/CSV" pada halaman Laporan.
 */
function laporanPegawaiLengkap() {
  var semua = semuaPegawaiLengkap_();
  return {
    judul: 'Data Pegawai RSUD Luwuk',
    tanggal: formatDateId(new Date()),
    rows: semua,
    kolom: [
      { key: 'id', label: 'ID Absen' },
      { key: 'nama', label: 'Nama' },
      { key: 'nik', label: 'NIK' },
      { key: 'nip', label: 'NIP' },
      { key: 'jenis_kelamin', label: 'L/P' },
      { key: 'agama', label: 'Agama' },
      { key: 'tempat_lahir', label: 'Tempat Lahir' },
      { key: 'tanggal_lahir', label: 'Tanggal Lahir' },
      { key: 'umur', label: 'Umur' },
      { key: 'status_pegawai', label: 'Status' },
      { key: 'jenis_pegawai', label: 'Jenis' },
      { key: 'gol', label: 'Golongan' },
      { key: 'gaji_pokok', label: 'Gaji Pokok' },
      { key: 'tempat_tugas', label: 'Unit / Tempat Tugas' },
      { key: 'jabatan', label: 'Jabatan' },
      { key: 'tmt_tempat_tugas', label: 'TMT Jabatan' },
      { key: 'tingkat_pend', label: 'Pendidikan' },
      { key: 'jurusan', label: 'Jurusan' },
      { key: 'tmt_rs_pertama', label: 'TMT RS Pertama' },
      { key: 'masa_kerja', label: 'Masa Kerja' },
      { key: 'tmt_kgb_terakhir', label: 'TMT KGB Terakhir' },
      { key: 'tanggal_pensiun', label: 'Perkiraan Pensiun' },
      { key: 'email', label: 'Email' },
      { key: 'nomor_hp', label: 'Nomor HP' }
    ]
  };
}
