/**
 * 21_Migrasi.js
 * Migrasi data dari aplikasi lama (spreadsheet "SIMPEG RSUD LUWUK",
 * ID 1FufDIsnjH3wsXNKwh4PoOCUovXlJ1-IhOG0LmXLYS7A) ke struktur
 * ternormalisasi aplikasi ini.
 *
 * SUMBER:
 *   1) Sheet utama  : 44 kolom, ±896 pegawai (data kepegawaian lengkap)
 *   2) Sheet absen  : 14 kolom, ±1215 orang (master absen)
 *
 * PERILAKU:
 *   - Baca sheet sumber, klasifikasi otomatis berdasarkan header.
 *   - Bersihkan data (parse tanggal Indonesia, NIK rusak, email/HP
 *     error, teks "Seumur Hidup") dan catat SETIAP anomali.
 *   - Tulis ke tabel baru via bulkInsert + catat audit log.
 *   - Laporan lengkap ditulis ke sheet "Laporan Migrasi".
 *
 * CARA PAKAI:
 *   1. migrasiPratinjau()  -> hitung & daftar anomali TANPA menulis
 *   2. migrasiDariSheetLama({ konfirmasi: true }) -> eksekusi
 */

var MIGRASI = {
  SPREADSHEET_LAMA: '1FufDIsnjH3wsXNKwh4PoOCUovXlJ1-IhOG0LmXLYS7A',
  SHEET_LAPORAN: 'Laporan Migrasi'
};

/** Label pangkat/golongan standar PNS (untuk pelengkap data lama). */
var LABEL_PANGKAT_GOL = {
  'I/a': 'Juru Muda', 'I/b': 'Juru Muda Tingkat I', 'I/c': 'Juru', 'I/d': 'Juru Tingkat I',
  'II/a': 'Pengatur Muda', 'II/b': 'Pengatur Muda Tingkat I', 'II/c': 'Pengatur', 'II/d': 'Pengatur Tingkat I',
  'III/a': 'Penata Muda', 'III/b': 'Penata Muda Tingkat I', 'III/c': 'Penata', 'III/d': 'Penata Tingkat I',
  'IV/a': 'Pembina', 'IV/b': 'Pembina Tingkat I', 'IV/c': 'Pembina Utama Muda',
  'IV/d': 'Pembina Utama Madya', 'IV/e': 'Pembina Utama'
};

var _migLaporan = [];

/**
 * Generator ID lokal (JS murni, tanpa pemanggilan service Apps Script).
 * Pemanggilan Utilities/uuid() ribuan kali di dalam loop pemrosesan
 * data sangat lambat di runtime GAS — karena itu migrasi memakai
 * counter lokal ini. ID hanya perlu unik di dalam masing-masing sheet.
 */
var _migCounter = {};
function migId(prefix) {
  _migCounter[prefix] = (_migCounter[prefix] || 0) + 1;
  return prefix + '-' + pad(_migCounter[prefix], 6);
}

function migCatat(jenis, id, nama, masalah, nilaiLama, nilaiBaru) {
  _migLaporan.push({
    waktu: nowIso(),
    jenis: jenis,
    id: id,
    nama: nama,
    masalah: masalah,
    nilai_lama: nilaiLama === undefined || nilaiLama === null ? '' : String(nilaiLama),
    nilai_baru: nilaiBaru === undefined || nilaiBaru === null ? '' : String(nilaiBaru)
  });
}

/* ======================= PEMBACA SHEET SUMBER ======================= */

/** Baca seluruh sheet sebagai array of object (dengan _row). */
function migBacaSheet(sh) {
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function (h) { return String(h).replace(/\s+/g, ' ').trim(); });
  var values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var kosong = row.every(function (v) { return v === '' || v === null; });
    if (kosong) continue;
    var obj = { _row: i + 2 };
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      obj[headers[c]] = row[c];
    }
    out.push(obj);
  }
  return out;
}

/** Cari & klasifikasi 2 sheet sumber di spreadsheet lama. */
function migTemukanSheetSumber() {
  var ss = SpreadsheetApp.openById(MIGRASI.SPREADSHEET_LAMA);
  var main = null, absen = null;
  ss.getSheets().forEach(function (sh) {
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
      .map(function (h) { return String(h).trim(); });
    var tandaMain = headers.indexOf('TMT KGB BERIKUTNYA') > -1 || headers.indexOf('JABATAN PERMENPAN') > -1;
    var tandaAbsen = headers.indexOf('TEMPAT LAHIR') > -1 && headers.indexOf('TANGGAL LAHIR') > -1;
    if (tandaMain && !main) main = sh;
    else if (tandaAbsen && !absen) absen = sh;
  });
  if (!main) throw AppError('Sheet utama app lama tidak ditemukan di ' + MIGRASI.SPREADSHEET_LAMA, 'MIGRASI_SUMBER');
  return { ss: ss, main: main, absen: absen };
}

/* ======================= PEMBUNGkus UNTUK EDITOR ======================= */
/**
 * Dropdown fungsi di editor Apps Script tidak bisa mengirim argumen,
 * jadi gunakan fungsi pembungkus ini:
 *
 *   migrasiJalankan        -> migrasi normal (896 pegawai dari sheet utama)
 *   migrasiJalankanGanti   -> hapus dulu semua data target, lalu migrasi ulang
 *   migrasiJalankanLengkap -> sertakan 319 orang yang hanya ada di master absen
 */

function migrasiJalankan() {
  return migrasiDariSheetLama({ konfirmasi: true, sumber2: false });
}

function migrasiJalankanTanpaAbsen() {
  return migrasiDariSheetLama({ konfirmasi: true, sumber2: false, pakaiAbsen: false });
}

function migrasiJalankanGanti() {
  return migrasiDariSheetLama({ konfirmasi: true, sumber2: false, ganti: true });
}

function migrasiJalankanLengkap() {
  return migrasiDariSheetLama({ konfirmasi: true, sumber2: true });
}

function migrasiJalankanLengkapGanti() {
  return migrasiDariSheetLama({ konfirmasi: true, sumber2: true, ganti: true });
}

/* ======================= PEMBERSIH DATA ======================= */

function migIsKosong(v) {
  if (v === null || v === undefined) return true;
  var s = String(v).trim();
  return s === '' || s === '-' || s === '#N/A' || s === '#ERROR!' || s === '#REF!' || s === '#VALUE!';
}

/** Normalkan ID Absen (angka atau teks). */
function migNormId(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/**
 * Pecah "Talima B, 16 Februari 1992" -> { tempat: 'Talima B', tanggal: '1992-02-16' }.
 * Kalau gagal, tempat berisi teks asli & tanggal ''.
 */
function migPecahTtl(teks) {
  var hasil = { tempat: '', tanggal: '' };
  if (migIsKosong(teks)) return hasil;
  var s = String(teks).trim();

  var iso = null;
  var idxKoma = s.lastIndexOf(',');
  if (idxKoma > -1) {
    var bagianKanan = s.substring(idxKoma + 1).trim();
    var d = parseDate(bagianKanan);
    if (d) {
      iso = d;
      hasil.tempat = s.substring(0, idxKoma).trim();
    }
  }
  if (!iso) {
    // cari pola tanggal di akhir teks
    var m = s.match(/(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*$/);
    if (m) {
      iso = parseDate(m[1]);
      if (iso) hasil.tempat = s.substring(0, m.index).replace(/[,;]\s*$/, '').trim();
    }
  }
  if (!iso) {
    // coba seluruh teks sebagai tanggal
    var d2 = parseDate(s);
    if (d2) iso = d2;
  }
  hasil.tanggal = iso ? formatDate(iso) : '';
  if (!hasil.tempat && !hasil.tanggal) hasil.tempat = s;
  return hasil;
}

/** Ubah nilai tanggal apa pun menjadi ISO; teks lain -> ''. */
function migTanggal(v) {
  if (migIsKosong(v)) return '';
  var d = parseDate(v);
  return d ? formatDate(d) : '';
}

/** Angka dari sel apa adanya; kosong -> null (bukan 0). */
function migAngka(v) {
  if (migIsKosong(v)) return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}

/* ======================= PRATINJAU (DRY RUN) ======================= */

function migrasiPratinjau() {
  _migLaporan = [];
  var sumber = migTemukanSheetSumber();
  var rowsMain = migBacaSheet(sumber.main);
  var rowsAbsen = sumber.absen ? migBacaSheet(sumber.absen) : [];

  var idSet = {};
  rowsMain.forEach(function (r) {
    var id = migNormId(r['ID ABSEN']);
    if (id) idSet[id] = true;
  });

  var hanyaAbsen = 0;
  rowsAbsen.forEach(function (r) {
    var id = migNormId(r['ID ABSEN']);
    if (id && !idSet[id]) hanyaAbsen++;
  });

  var summary = {
    sheetUtama: sumber.main.getName() + ' (' + rowsMain.length + ' baris)',
    sheetAbsen: sumber.absen ? sumber.absen.getName() + ' (' + rowsAbsen.length + ' baris)' : '(tidak ada)',
    pegawaiAkanDimigrasi: rowsMain.length,
    hanyaAdaDiAbsen: hanyaAbsen,
    targetSudahAdaData: repoPegawai().all().length
  };
  console.log('=== migrasiPratinjau ===\n' + JSON.stringify(summary, null, 2));
  return summary;
}

/* ======================= EKSEKUSI MIGRASI ======================= */

/**
 * @param {Object} opsi
 *   konfirmasi  : wajib true — penanda eksekusi disengaja
 *   ganti       : true = hapus dulu semua data lama di target
 *   sumber2     : true = sertakan 309+ orang yang hanya ada di master absen
 */
function migrasiDariSheetLama(opsi) {
  opsi = opsi || {};
  if (!opsi.konfirmasi) {
    throw AppError('Migrasi dibatalkan: jalankan dengan { konfirmasi: true }.', 'MIGRASI_BATAL');
  }
  _migLaporan = [];
  var mulai = new Date();
  function tahap(pesan) {
    console.log('[migrasi] ' + pesan + ' (' +
      Math.round((new Date().getTime() - mulai.getTime()) / 1000) + 's)');
    SpreadsheetApp.flush();
  }

  tahap('mulai');
  var sudahAda = repoPegawai().all().length;
  tahap('cek data target: ' + sudahAda);
  if (sudahAda > 0 && !opsi.ganti) {
    throw AppError(
      'Database sudah berisi ' + sudahAda + ' pegawai. Jalankan dengan { ganti: true } untuk mengosongkan lebih dulu, atau batalkan.',
      'MIGRASI_ADA_DATA'
    );
  }
  if (opsi.ganti) { migKosongkanTarget(); tahap('target dikosongkan'); }

  var sumber = migTemukanSheetSumber();
  tahap('sumber ditemukan: ' + sumber.main.getName());
  var rowsMain = migBacaSheet(sumber.main);
  tahap('baca sheet utama: ' + rowsMain.length + ' baris');

  /* ---------- 1) Bangun record Pegawai dari sheet utama ---------- */
  var pegawaiMap = {};   // id -> objek Pegawai
  var TGL_MIGRASI = formatDateId(nowIso()); // dihitung sekali, bukan per baris
  var riwayatStatus = [];
  var riwayatPend = [];
  var riwayatPangkat = [];
  var riwayatJabatan = [];
  var riwayatKgb = [];
  var masaKerja = [];
  var dokumen = [];
  var unitBaru = {};     // nama tempat tugas -> true
  var duplikatNik = {};

  rowsMain.forEach(function (r) {
    var id = migNormId(r['ID ABSEN']);
    var nama = migIsKosong(r['NAMA']) ? '' : String(r['NAMA']).trim();
    if (!id || !nama) {
      migCatat('Baris dilewati', id, nama, 'ID Absen atau Nama kosong di sheet lama', '', '');
      return;
    }

    // --- NIK ---
    var nikMentah = r['NIK'];
    var nik = normalisasiNIK(nikMentah);
    if (migIsKosong(nikMentah)) migCatat('NIK', id, nama, 'NIK kosong di sheet lama', '', '');
    else if (!nik) migCatat('NIK', id, nama, 'NIK rusak format angka ilmiah — dibiarkan kosong', String(nikMentah), '');
    else if (nik.length !== 16) migCatat('NIK', id, nama, 'NIK bukan 16 digit (' + nik.length + ')', String(nikMentah), nik);
    if (nik) {
      if (duplikatNik[nik]) migCatat('Duplikat NIK', id, nama, 'NIK sama dengan pegawai lain — perlu ditinjau', nik, '');
      duplikatNik[nik] = id;
    }

    // --- TTL ---
    var ttl = migPecahTtl(r['TEMPAT TANGGAL LAHIR']);
    if (ttl.tempat && !ttl.tanggal) {
      migCatat('Tanggal lahir', id, nama, 'Tanggal lahir tidak terbaca dari TEMPAT TANGGAL LAHIR', String(r['TEMPAT TANGGAL LAHIR']), ttl.tempat);
    }

    // --- Email & HP ---
    var email = normalisasiEmail(r['EMAIL']);
    if (!migIsKosong(r['EMAIL']) && !email) migCatat('Email', id, nama, 'Email tidak valid — dibiarkan kosong', String(r['EMAIL']), '');
    var hp = normalisasiHp(r['NOMOR HP']);
    if (!migIsKosong(r['NOMOR HP']) && !hp) migCatat('HP', id, nama, 'Nomor HP tidak valid — dibiarkan kosong', String(r['NOMOR HP']), '');

    pegawaiMap[id] = {
      id: id,
      nik: nik || '',
      nip: migIsKosong(r['NIP']) ? '' : String(r['NIP']).trim(),
      npwp: migIsKosong(r['NPWP']) ? '' : String(r['NPWP']).trim(),
      karpeg: migIsKosong(r['KARPEG-NAKERTRANS']) ? '' : String(r['KARPEG-NAKERTRANS']).trim(),
      nama: nama,
      jenis_kelamin: migIsKosong(r['JENIS KELAMIN']) ? '' : String(r['JENIS KELAMIN']).trim(),
      agama: migIsKosong(r['AGAMA']) ? '' : String(r['AGAMA']).trim(),
      email: email,
      nomor_hp: hp,
      tempat_lahir: ttl.tempat,
      kota_tempat_lahir: '',
      tanggal_lahir: ttl.tanggal,
      link_foto: migIsKosong(r['LINK FOTO']) ? '' : String(r['LINK FOTO']).trim(),
      catatan: 'Dimigrasi dari app lama pada ' + TGL_MIGRASI
    };

    // --- Riwayat Status ---
    var statusRek = {
      id: migId('RST'),
      pegawai_id: id,
      nama: nama,
      status_pegawai: migIsKosong(r['STATUS PEGAWAI']) ? '' : String(r['STATUS PEGAWAI']).trim(),
      tmt_status: migTanggal(r['TMT STATUS PEG']),
      jenis_pegawai: migIsKosong(r['JENIS PEGAWAI']) ? '' : String(r['JENIS PEGAWAI']).trim(),
      tmt_jenis_pegawai: '',
      no_sk: migIsKosong(r['NO SURAT KEPUTUSAN STATUS']) ? '' : String(r['NO SURAT KEPUTUSAN STATUS']).trim(),
      tmt_sk: migTanggal(r['TMT SK STATUS']),
      keterangan: ''
    };
    var tmtStatusMentah = String(r['TMT STATUS PEG'] || '').trim();
    if (!migIsKosong(tmtStatusMentah) && !statusRek.tmt_status) {
      migCatat('Tanggal TMT', id, nama, 'TMT status pegawai tidak terbaca', tmtStatusMentah, '');
    }
    riwayatStatus.push(statusRek);

    // --- Riwayat Pendidikan (dari baris utama; riwayat lama tak dibawa) ---
    var pend = {
      id: migId('RPD'),
      pegawai_id: id,
      tingkat_pend: migIsKosong(r['TINGKAT PEND']) ? '' : String(r['TINGKAT PEND']).trim(),
      nama_kampus: migIsKosong(r['NAMA KAMPUS']) ? '' : String(r['NAMA KAMPUS']).trim(),
      jurusan: migIsKosong(r['JURUSAN/PEMINATAN']) ? '' : String(r['JURUSAN/PEMINATAN']).trim(),
      gelar_depan: migIsKosong(r['GELAR DEPAN']) ? '' : String(r['GELAR DEPAN']).trim(),
      gelar_belakang: migIsKosong(r['GELAR BELAKANG']) ? '' : String(r['GELAR BELAKANG']).trim()
    };
    if (pend.tingkat_pend || pend.nama_kampus || pend.jurusan || pend.gelar_depan || pend.gelar_belakang) {
      riwayatPend.push(pend);
    }

    // --- Riwayat Pangkat ---
    var gol = migIsKosong(r['GOL']) ? '' : String(r['GOL']).trim();
    var pangkat = {
      id: migId('RPG'),
      pegawai_id: id,
      gol: gol,
      nama_sk: '',
      nomor_sk: '',
      tmt: migTanggal(r['TMT PANGKAT']),
      gaji_pokok: migAngka(r['GAJI POKOK']),
      jabatan_permenpan: migIsKosong(r['JABATAN PERMENPAN']) ? '' : String(r['JABATAN PERMENPAN']).trim(),
      kelas_jabatan: migAngka(r['KELAS JABATAN']),
      jabatan_tpp: migIsKosong(r['TPP']) ? '' : String(r['TPP']).trim()
    };
    var tmtPangkatMentah = String(r['TMT PANGKAT'] || '').trim();
    if (!migIsKosong(tmtPangkatMentah) && !pangkat.tmt) {
      migCatat('Tanggal TMT', id, nama, 'TMT pangkat tidak terbaca', tmtPangkatMentah, '');
    }
    if (gol || pangkat.tmt || pangkat.gaji_pokok || pangkat.jabatan_permenpan) {
      riwayatPangkat.push(pangkat);
    }
    if (gol && /^[IV]+\/[a-e]$/.test(gol) && !LABEL_PANGKAT_GOL[gol]) {
      migCatat('Golongan', id, nama, 'Golongan tidak dikenali', gol, '');
    }

    // --- Riwayat Jabatan / tempat tugas ---
    var tempatTugas = migIsKosong(r['TEMPAT TUGAS']) ? '' : String(r['TEMPAT TUGAS']).trim();
    var jabatan = {
      id: migId('RJB'),
      pegawai_id: id,
      tempat_tugas: tempatTugas,
      jabatan: migIsKosong(r['JABATAN']) ? '' : String(r['JABATAN']).trim(),
      tmt_tempat_tugas: migTanggal(r['TMT TEMPAT TUGAS']),
      no_sk: ''
    };
    if (tempatTugas || jabatan.jabatan || jabatan.tmt_tempat_tugas) {
      riwayatJabatan.push(jabatan);
      if (tempatTugas) unitBaru[tempatTugas] = true;
    }

    // --- Riwayat KGB ---
    var tmtKgb = migTanggal(r['TMT KGB TERAKHIR']);
    if (tmtKgb) {
      riwayatKgb.push({
        id: migId('RKG'),
        pegawai_id: id,
        gol: gol,
        nomor_sk: '',
        tmt_kgb: tmtKgb,
        gaji_berkala: migAngka(r['GAJI BERKALA TERAKHIR'])
      });
    }

    // --- Dokumen SIP & STR (dipisah per jenis) ---
    migTambahDokumen(dokumen, id, 'SIP', r['NOMOR SIP'], r['TMT TERBIT SIP'], r['TMT VALID SIP'], nama);
    migTambahDokumen(dokumen, id, 'STR', r['NOMOR STR'], r['TMT TERBIT STR'], r['TMT VALID STR'], nama);

    // --- Masa kerja ---
    var tmtRs = migTanggal(r['TMT RS PERTAMA']);
    if (tmtRs) {
      masaKerja.push({ id: migId('MKR'), pegawai_id: id, tmt_rs_pertama: tmtRs, tmt_rs_terakhir: '', keterangan: '' });
    } else {
      migCatat('Masa kerja', id, nama, 'TMT RS pertama tidak terbaca/kosong', String(r['TMT RS PERTAMA'] || ''), '');
    }
  });

  /* ---------- 2) Pelengkap dari master absen ---------- */
  tahap('proses ' + Object.keys(pegawaiMap).length + ' pegawai dari sheet utama selesai');
  var absenMap = {};
  if (sumber.absen && opsi.pakaiAbsen !== false) {
    migBacaSheet(sumber.absen).forEach(function (r) {
      var id = migNormId(r['ID ABSEN']);
      if (id) absenMap[id] = r;
    });
    tahap('master absen dimuat: ' + Object.keys(absenMap).length + ' baris');
    migCatat('Info', '', '', 'Master absen dimuat: ' + Object.keys(absenMap).length + ' baris (dipakai untuk melengkapi & mendeteksi gap)', '', '');
  } else {
    tahap('master absen DILEWATI (opsi pakaiAbsen=false)');
    migCatat('Info', '', '', 'Master absen dilewati — gap absen tidak dideteksi pada run ini', '', '');
  }

  var gapAbsen = [];
  Object.keys(absenMap).forEach(function (id) {
    if (pegawaiMap[id]) {
      // Lengkapi kekosongan penting dari master absen
      var p = pegawaiMap[id];
      var a = absenMap[id];
      if (!p.tempat_lahir && !migIsKosong(a['TEMPAT LAHIR'])) p.tempat_lahir = String(a['TEMPAT LAHIR']).trim();
      if (!p.kota_tempat_lahir && !migIsKosong(a['KOTA TEMPAT LAHIR'])) p.kota_tempat_lahir = String(a['KOTA TEMPAT LAHIR']).trim();
      if (!p.tanggal_lahir && !migIsKosong(a['TANGGAL LAHIR'])) {
        var d = migTanggal(a['TANGGAL LAHIR']);
        if (d) p.tanggal_lahir = d;
      }
      if (!p.email && !migIsKosong(a['EMAIL'])) p.email = normalisasiEmail(a['EMAIL']);
      if (!p.nomor_hp && !migIsKosong(a['NOMOR HP'])) p.nomor_hp = normalisasiHp(a['NOMOR HP']);
      if (!p.link_foto && !migIsKosong(a['LINK FOTO'])) p.link_foto = String(a['LINK FOTO']).trim();
    } else {
      gapAbsen.push(id);
    }
  });

  gapAbsen.forEach(function (id) {
    var a = absenMap[id];
    var nama = migIsKosong(a['NAMA']) ? '' : String(a['NAMA']).trim();
    if (!nama) { migCatat('Baris dilewati', id, '', 'Ada di master absen tapi tanpa nama', '', ''); return; }
    var dibuat = false;
    if (opsi.sumber2) {
      var tglA = migTanggal(a['TANGGAL LAHIR']);
      pegawaiMap[id] = {
        id: id,
        nik: normalisasiNIK(a['NIK']),
        nip: migIsKosong(a['NIP']) ? '' : String(a['NIP']).trim(),
        npwp: migIsKosong(a['NPWP']) ? '' : String(a['NPWP']).trim(),
        karpeg: migIsKosong(a['KARPEG-NAKERTRANS']) ? '' : String(a['KARPEG-NAKERTRANS']).trim(),
        nama: nama,
        jenis_kelamin: migIsKosong(a['JENIS KELAMIN']) ? '' : String(a['JENIS KELAMIN']).trim(),
        agama: migIsKosong(a['AGAMA']) ? '' : String(a['AGAMA']).trim(),
        email: normalisasiEmail(a['EMAIL']),
        nomor_hp: normalisasiHp(a['NOMOR HP']),
        tempat_lahir: migIsKosong(a['TEMPAT LAHIR']) ? '' : String(a['TEMPAT LAHIR']).trim(),
        kota_tempat_lahir: migIsKosong(a['KOTA TEMPAT LAHIR']) ? '' : String(a['KOTA TEMPAT LAHIR']).trim(),
        tanggal_lahir: tglA,
        link_foto: migIsKosong(a['LINK FOTO']) ? '' : String(a['LINK FOTO']).trim(),
        catatan: 'Hanya ada di master absen; riwayat kepegawaian belum lengkap. Dimigrasi ' + TGL_MIGRASI
      };
      dibuat = true;
    }
    migCatat('Gap absen', id, nama,
      'Ada di master absen tapi TIDAK ada di detail SIMPEG — riwayat belum lengkap',
      '', dibuat ? 'Pegawai dibuat (riwayat belum lengkap)' : 'Tidak dibuat (sumber2=false)');
  });

  /* ---------- 3) Tulis ke database baru ---------- */
  var pegawaiList = Object.keys(pegawaiMap).map(function (k) { return pegawaiMap[k]; });
  tahap('gap absen: ' + gapAbsen.length + ' orang');

  // Unit kerja: pastikan tempat tugas unik ada di tabel UnitKerja
  var unitDibuat = 0;
  Object.keys(unitBaru).forEach(function (namaUnit) {
    var ada = repoUnits().first({ nama: namaUnit });
    if (!ada) {
      repoUnits().insert({
        kode: 'U' + pad(++unitDibuat, 3),
        nama: namaUnit,
        singkatan: namaUnit.length > 20 ? namaUnit.substring(0, 20) : namaUnit,
        level: 3,
        aktif: true
      });
    }
  });
  tahap('unit kerja dibuat: ' + unitDibuat);

  repoPegawai().bulkInsert(pegawaiList);
  tahap('Pegawai ditulis: ' + pegawaiList.length);

  var nStatus = 0, nPend = 0, nPangkat = 0, nJabatan = 0, nKgb = 0, nMk = 0, nDok = 0;
  if (riwayatStatus.length) { nStatus = repoRiwayatStatus().bulkInsert(riwayatStatus).length; }
  tahap('RiwayatStatus ditulis: ' + nStatus);
  if (riwayatPend.length) { nPend = repoRiwayatPendidikan().bulkInsert(riwayatPend).length; }
  tahap('RiwayatPendidikan ditulis: ' + nPend);
  if (riwayatPangkat.length) { nPangkat = repoRiwayatPangkat().bulkInsert(riwayatPangkat).length; }
  tahap('RiwayatPangkat ditulis: ' + nPangkat);
  if (riwayatJabatan.length) { nJabatan = repoRiwayatJabatan().bulkInsert(riwayatJabatan).length; }
  tahap('RiwayatJabatan ditulis: ' + nJabatan);
  if (riwayatKgb.length) { nKgb = repoRiwayatKGB().bulkInsert(riwayatKgb).length; }
  tahap('RiwayatKGB ditulis: ' + nKgb);
  if (masaKerja.length) { nMk = repoMasaKerja().bulkInsert(masaKerja).length; }
  tahap('MasaKerja ditulis: ' + nMk);
  if (dokumen.length) { nDok = repoDokumen().bulkInsert(dokumen).length; }
  tahap('Dokumen ditulis: ' + nDok);

  /* ---------- 4) Laporan ---------- */
  var ringkas = {
    durasiDetik: Math.round((new Date().getTime() - mulai.getTime()) / 1000),
    pegawai: pegawaiList.length,
    riwayatStatus: nStatus,
    riwayatPendidikan: nPend,
    riwayatPangkat: nPangkat,
    riwayatJabatan: nJabatan,
    riwayatKgb: nKgb,
    masaKerja: nMk,
    dokumen: nDok,
    unitDibuat: unitDibuat,
    gapAbsen: gapAbsen.length,
    anomaliDicatat: _migLaporan.length
  };

  migTulisLaporan(ringkas);
  catatLog('CREATE', 'Migrasi', '', 'Migrasi data dari app lama selesai',
    null, ringkas);

  console.log('=== migrasiDariSheetLama SELESAI ===\n' + JSON.stringify(ringkas, null, 2));

  // Verifikasi ulang
  var cek = diagnosaData();
  console.log(cek);

  return ringkas;
}

/** Tambah baris Dokumen (SIP/STR) bila ada nomor atau masa berlaku. */
function migTambahDokumen(koleksi, id, jenis, nomor, tmtTerbit, tmtValid, nama) {
  var n = migIsKosong(nomor) ? '' : String(nomor).trim();
  var tbit = migTanggal(tmtTerbit);
  var tval = migTanggal(tmtValid);
  if (!tval && isLifetimeText(tmtValid)) tval = String(tmtValid).trim(); // "Seumur Hidup" disimpan apa adanya
  if (!n && !tbit && !tval) return;
  if (!migIsKosong(tmtValid) && !tval) {
    migCatat('Dokumen ' + jenis, id, nama, 'Masa berlaku tidak terbaca', String(tmtValid), '');
  }
  koleksi.push({
    id: migId('DKM'),
    pegawai_id: id,
    jenis: jenis,
    nomor: n,
    tmt_terbit: tbit,
    tmt_valid: tval,
    catatan: 'Dimigrasi dari app lama'
  });
}

/** Kosongkan seluruh tabel target (untuk migrasi ulang). */
function migKosongkanTarget() {
  ['RiwayatStatus', 'RiwayatPendidikan', 'RiwayatPangkat', 'RiwayatJabatan',
    'RiwayatKGB', 'MasaKerja', 'Dokumen', 'Pegawai'].forEach(function (t) {
    var sh = getSheet(t);
    if (sh && sh.getLastRow() > 1) {
      sh.deleteRows(2, sh.getLastRow() - 1);
    }
  });
  migCatat('Info', '', '', 'Semua tabel target dikosongkan (opsi ganti=true)', '', '');
}

/** Tulis laporan migrasi ke sheet khusus. */
function migTulisLaporan(ringkas) {
  var ss = getWorkbook();
  var sh = ss.getSheetByName(MIGRASI.SHEET_LAPORAN);
  if (!sh) sh = ss.insertSheet(MIGRASI.SHEET_LAPORAN);
  sh.clearContents();
  var headers = ['WAKTU', 'JENIS', 'ID ABSEN', 'NAMA', 'MASALAH', 'NILAI LAMA', 'NILAI BARU'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#0f6b64').setFontColor('#ffffff');
  sh.setFrozenRows(1);

  var rows = [['=== RINGKASAN ===', JSON.stringify(ringkas), '', '', '', '', '']];

  // Ringkasan per jenis anomali
  var perJenis = {};
  _migLaporan.forEach(function (l) {
    perJenis[l.jenis] = (perJenis[l.jenis] || 0) + 1;
  });
  rows.push(['--- Anomali per jenis ---', '', '', '', '', '', '']);
  Object.keys(perJenis).sort(function (a, b) { return perJenis[b] - perJenis[a]; }).forEach(function (j) {
    rows.push([j, perJenis[j] + ' kasus', '', '', '', '', '']);
  });

  rows.push(['--- Detail anomali ---', '', '', '', '', '', '']);
  _migLaporan.forEach(function (l) {
    rows.push([l.waktu, l.jenis, l.id, l.nama, l.masalah, l.nilai_lama, l.nilai_baru]);
  });

  sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  for (var c = 1; c <= headers.length; c++) {
    sh.setColumnWidth(c, c === 5 ? 420 : 160);
  }
}
