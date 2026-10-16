/**
 * 99_Diagnosis.js
 * Modul diagnostik — mengecek kesehatan struktur database & data
 * langsung dari editor Apps Script, tanpa membuka web app.
 *
 * Cara pakai: pilih fungsi `diagnosaStruktur` (atau `diagnosaData`)
 * di dropdown editor → Run → lihat Execution log.
 */

/**
 * Diagnosa struktur: pastikan seluruh sheet & header sesuai schema.
 * Return: ringkasan teks (juga ditulis ke console.log).
 */
function diagnosaStruktur() {
  var ss = getWorkbook();
  if (!ss) {
    throw AppError('Spreadsheet database tidak dapat diakses.', 'CONFIG_MISSING');
  }

  var out = [];
  var ada = 0, hilang = [];

  SHEET_NAMES.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) { hilang.push(name); return; }
    ada++;

    // Cek header baris 1 sesuai label schema
    var labels = SHEETS[name].map(function (c) { return c.label; });
    var actual = sh.getLastRow() >= 1
      ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); })
      : [];
    var beda = [];
    for (var i = 0; i < labels.length; i++) {
      if (actual[i] !== labels[i]) beda.push('kolom ' + (i + 1) + ': harus "' + labels[i] + '", dapat "' + (actual[i] || '(kosong)') + '"');
    }
    var statusHeader = beda.length ? ' ❌ ' + beda.slice(0, 3).join(' | ') : ' ✅';
    var rows = Math.max(0, sh.getLastRow() - 1);
    out.push(name + ': ' + rows + ' baris' + statusHeader);
  });

  var ringkas =
    'Sheet ada: ' + ada + '/' + SHEET_NAMES.length +
    (hilang.length ? ' | HILANG: ' + hilang.join(', ') : '') +
    '\n' + out.join('\n');

  console.log('=== diagnosaStruktur ===\n' + ringkas);
  return ringkas;
}

/**
 * Diagnosa isi data: hitung baris per tabel & cek anomali umum
 * (duplikat ID, pegawai tanpa riwayat status, dll).
 */
function diagnosaData() {
  var out = [];
  var pegawai = repoPegawai().all();
  var status = repoRiwayatStatus().all();

  out.push('Pegawai: ' + pegawai.length + ' baris');
  out.push('Riwayat status: ' + status.length + ' baris');
  out.push('Users: ' + repoUsers().all().length + ' | UnitKerja: ' + repoUnits().all().length +
    ' | Config: ' + repoConfig().all().length);

  // Cek ID ganda
  var seen = {}, duplikat = [];
  pegawai.forEach(function (p) {
    var id = String(p.id || '').trim();
    if (!id) return;
    if (seen[id]) duplikat.push(id);
    seen[id] = true;
  });
  out.push('ID Pegawai duplikat: ' + (duplikat.length ? duplikat.slice(0, 20).join(', ') : 'tidak ada'));

  // Pegawai tanpa riwayat status
  var punyaStatus = {};
  status.forEach(function (s) { punyaStatus[String(s.pegawai_id || '')] = true; });
  var tanpaStatus = pegawai.filter(function (p) { return !punyaStatus[String(p.id || '')]; });
  out.push('Pegawai tanpa riwayat status: ' + tanpaStatus.length +
    (tanpaStatus.length ? ' (contoh: ' + tanpaStatus.slice(0, 5).map(function (p) { return p.id + ' ' + p.nama; }).join('; ') + ')' : ''));

  // Pegawai tanpa NIK / tanpa tanggal lahir
  var tanpaNik = pegawai.filter(function (p) { return !String(p.nik || '').trim(); }).length;
  var tanpaTgl = pegawai.filter(function (p) { return !String(p.tanggal_lahir || '').trim(); }).length;
  out.push('Pegawai tanpa NIK: ' + tanpaNik + ' | tanpa tanggal lahir: ' + tanpaTgl);

  var ringkas = out.join('\n');
  console.log('=== diagnosaData ===\n' + ringkas);
  return ringkas;
}

/** Menjalankan kedua diagnosa sekaligus. */
function diagnosaSemua() {
  var a = diagnosaStruktur();
  var b = diagnosaData();
  return a + '\n\n' + b;
}

/**
 * Diagnosa per-langkah untuk dijalankan DARI BROWSER (halaman Diagnosa
 * di web app). Tiap langkah diukur waktunya sehingga kita tahu pasti
 * bagian mana yang lambat atau macet — tanpa harus buka editor.
 *
 * Langkah tersedia: ping, users, kgb, status, pegawai, jabatan, dokumen,
 * ringkas, opsi, statistik, monitoring, dashboard.
 */
function diagLangkah(nama) {  var t0 = new Date().getTime();
  var hasil = null;
  try {
    switch (String(nama || '').toLowerCase()) {
      case 'ping':
        hasil = { echo: 'ok', waktu: nowIso(), tz: getTimezone() };
        break;
      case 'users':
        hasil = { baris: repoUsers().all().length };
        break;
      case 'kgb':
        hasil = { baris: repoRiwayatKGB().all().length };
        break;
      case 'status':
        hasil = { baris: repoRiwayatStatus().all().length };
        break;
      case 'pegawai':
        hasil = { baris: repoPegawai().all().length };
        break;
      case 'jabatan':
        hasil = { baris: repoRiwayatJabatan().all().length };
        break;
      case 'dokumen':
        hasil = { baris: repoDokumen().all().length };
        break;
      case 'ringkas':
        hasil = { baris: semuaPegawaiRingkas_().length };
        break;
      case 'opsi':
        var o = opsiFilterPegawai();
        hasil = { jenis: o.jenis.length, unit: o.unit.length, status: o.status.length };
        break;
      case 'statistik':
        var s = semuaPegawaiLengkap_();
        var st = hitungStatistik(s);
        hasil = { baris: s.length, totalStat: st.total };
        break;
      case 'monitoring':
        var m = dataMonitoring();
        hasil = m.ringkas;
        break;
      case 'dashboard':
        var d = getDashboardData();
        hasil = { total: d.statistik.total, dariCache: false };
        break;
      default:
        throw AppError('Langkah diagnosa tidak dikenal: ' + nama, 'VALIDASI');
    }
  } catch (e) {
    return { nama: nama, ok: false, ms: new Date().getTime() - t0, error: e.message };
  }
  return { nama: nama, ok: true, ms: new Date().getTime() - t0, hasil: hasil };
}

/**
 * Mengukur kecepatan pembacaan setiap tabel (dipakai untuk memastikan
 * aplikasi tidak melampaui batas 6 menit GAS).
 *
 * Jalankan fungsi ini di editor bila halaman web app "Memuat…" terus.
 * Target: setiap tabel < 2 detik, total < 10 detik.
 */
function ujiKecepatanBaca() {
  var out = [];
  var total = 0;

  function ukur(nama, fn) {
    var t0 = new Date().getTime();
    var hasil;
    try { hasil = fn(); } catch (e) {
      out.push(nama + ': ERROR ' + e.message);
      return;
    }
    var ms = new Date().getTime() - t0;
    total += ms;
    out.push(nama + ': ' + ms + ' ms (' + (hasil === null || hasil === undefined ? '?' : (typeof hasil === 'number' ? hasil : hasil.length)) + ' baris)');
  }

  var daftar = [
    ['Pegawai', function () { return repoPegawai().all(); }],
    ['RiwayatStatus', function () { return repoRiwayatStatus().all(); }],
    ['RiwayatPendidikan', function () { return repoRiwayatPendidikan().all(); }],
    ['RiwayatPangkat', function () { return repoRiwayatPangkat().all(); }],
    ['RiwayatJabatan', function () { return repoRiwayatJabatan().all(); }],
    ['RiwayatKGB', function () { return repoRiwayatKGB().all(); }],
    ['MasaKerja', function () { return repoMasaKerja().all(); }],
    ['Dokumen', function () { return repoDokumen().all(); }],
    ['Users', function () { return repoUsers().all(); }],
    ['UnitKerja', function () { return repoUnits().all(); }]
  ];
  daftar.forEach(function (d) { ukur(d[0], d[1]); });

  // Pembacaan berulang harus instan (menggunakan cache per-eksekusi).
  ukur('Pegawai (cache)', function () { return repoPegawai().all(); });

  // Operasi lengkap seperti yang dilakukan dashboard.
  var t1 = new Date().getTime();
  try {
    var semua = semuaPegawaiLengkap_();
    var dash = hitungStatistik(semua);
    ukur('semuaPegawaiLengkap_ + statistik', function () { return semua.length; });
  } catch (e) {
    out.push('semuaPegawaiLengkap_: ERROR ' + e.message);
  }
  void dash;
  void t1;

  var t2 = new Date().getTime();
  try { dataMonitoring(); } catch (e) { out.push('dataMonitoring: ERROR ' + e.message); }
  out.push('dataMonitoring: ' + (new Date().getTime() - t2) + ' ms');

  out.push('---');
  out.push('TOTAL: ' + total + ' ms (baca skema, tanpa cache)');
  var ringkas = out.join('\n');
  console.log('=== ujiKecepatanBaca ===\n' + ringkas);
  return ringkas;
}

/**
 * Ukuran & kondisi setiap sheet di spreadsheet — TANPA membaca isi sel,
 * jadi sangat murah. Dipakai untuk menemukan sheet "gemuk" (banyak
 * kolom/baris kosong yang dibawa sisa impor CSV) yang membuat
 * aplikasi terasa macet.
 */
function diagInfoSheet() {
  var t0 = new Date().getTime();
  var out = { spreadsheet: null, sheets: [], error: null };
  try {
    var wb = getWorkbook();
    if (!wb) throw AppError('Spreadsheet database tidak dapat diakses.', 'CONFIG_MISSING');
    out.spreadsheet = { nama: wb.getName(), id: wb.getId() };

    SHEET_NAMES.forEach(function (nama) {
      var t1 = new Date().getTime();
      try {
        var sh = wb.getSheetByName(nama);
        if (!sh) {
          out.sheets.push({ nama: nama, ada: false, ms: new Date().getTime() - t1 });
          return;
        }
        out.sheets.push({
          nama: nama,
          ada: true,
          maxBaris: sh.getMaxRows(),      // kapasitas sheet (termasuk baris kosong)
          maxKolom: sh.getMaxColumns(),   // kapasitas sheet (termasuk kolom kosong)
          isiBaris: sh.getLastRow(),      // baris terakhir yang berisi data
          isiKolom: sh.getLastColumn(),   // kolom terakhir yang berisi data
          ms: new Date().getTime() - t1
        });
      } catch (e) {
        out.sheets.push({ nama: nama, error: e.message });
      }
    });
  } catch (e) {
    out.error = e.message;
  }
  out.ms = new Date().getTime() - t0;
  return out;
}

/**
 * Merapikan satu sheet: membuang baris & kolom kosong berlebih yang
 * sering tertinggal dari hasil impor CSV. Sheet yang "gemuk" membuat
 * pembacaan data menjadi sangat lambat walaupun isinya sedikit.
 *
 * Aman: hanya menghapus di LUAR area yang berisi data.
 */
function rapikanSheet(nama) {
  var out = { nama: nama };
  try {
    var sheet = getSheet(nama);
    if (!sheet) throw AppError('Sheet "' + nama + '" tidak ada.', 'NOT_FOUND');

    var isiBaris = sheet.getLastRow();
    var isiKolom = sheet.getLastColumn();
    var maxBaris = sheet.getMaxRows();
    var maxKolom = sheet.getMaxColumns();

    out.sebelum = { baris: maxBaris, kolom: maxKolom };
    var hapusBaris = 0, hapusKolom = 0;

    // Sisakan marjin kecil supaya tidak perlu tumbuh setiap kali ada input.
    var sisaBaris = Math.max(200, isiBaris + 100);
    if (maxBaris > sisaBaris) {
      sheet.deleteRows(sisaBaris + 1, maxBaris - sisaBaris);
      hapusBaris = maxBaris - sisaBaris;
    }
    var kolomPerlu = getColumns(nama).length;
    var sisaKolom = Math.max(kolomPerlu + 5, isiKolom + 5);
    if (maxKolom > sisaKolom) {
      sheet.deleteColumns(sisaKolom + 1, maxKolom - sisaKolom);
      hapusKolom = maxKolom - sisaKolom;
    }

    out.sesudah = { baris: sheet.getMaxRows(), kolom: sheet.getMaxColumns() };
    out.hapus = { baris: hapusBaris, kolom: hapusKolom };
    out.ok = true;
  } catch (e) {
    out.ok = false;
    out.error = e.message;
  }
  return out;
}

/** Merapikan seluruh sheet pada database. */
function rapikanSemuaSheet() {
  var out = [];
  SHEET_NAMES.forEach(function (nama) {
    var sh = getWorkbook().getSheetByName(nama);
    if (sh) out.push(rapikanSheet(nama));
  });
  flushWorkbookCache();
  return out;
}

/**
 * Uji baca satu sheet dengan batas baris tertentu (untuk mencari tahu
 * apakah pembacaan lambat karena jumlah baris atau karena isi sheet).
 */
function diagBacaSheet(nama, batasBaris) {
  var t0 = new Date().getTime();
  var out = { nama: nama };
  try {
    var sheet = getSheet(nama);
    if (!sheet) throw AppError('Sheet "' + nama + '" tidak ada.', 'NOT_FOUND');

    var lastRow = sheet.getLastRow();
    var ncol = getColumns(nama).length;
    out.isiBaris = lastRow;
    out.jumlahKolom = ncol;
    out.maxBaris = sheet.getMaxRows();
    out.maxKolom = sheet.getMaxColumns();

    var maxData = Math.max(0, lastRow - 1);
    var batas = batasBaris > 0 ? Math.min(batasBaris, maxData) : maxData;
    out.barisDibaca = batas;

    var tBaca = new Date().getTime();
    var values = batas > 0
      ? sheet.getRange(2, 1, batas, Math.min(ncol, sheet.getLastColumn() || ncol)).getValues()
      : [];
    out.msGetValues = new Date().getTime() - tBaca;

    var tObjek = new Date().getTime();
    var rows = [];
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0] || '').trim() === '') continue;
      rows.push(rowToObj(nama, values[i]));
    }
    out.msRowToObj = new Date().getTime() - tObjek;
    out.barisTerpakai = rows.length;
    out.contoh = rows.length ? { id: rows[0].id, kolom1: String(rows[0][getColumns(nama)[1].key]) } : null;
  } catch (e) {
    out.error = e.message;
  }
  out.ms = new Date().getTime() - t0;
  return out;
}
