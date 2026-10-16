/**
 * 52_Sk.js
 * Pencetak Surat Keputusan (SK) dari usulan yang sudah DISETUJUI.
 *
 * Dua keluaran:
 *   1. `pratinjauSk(usulanId)`  -> HTML untuk dilihat/dicetak di web app
 *   2. `cetakSk(usulanId)`      -> file .doc tersimpan di Drive (bisa
 *                                 dibuka & diedit di Microsoft Word/
 *                                 Google Docs), linknya disimpan ke usulan
 *
 * Redaksi mengikuti pola SK kepegawaian umum dan dapat disesuaikan lewat
 * Config (SK_PEJABAT, SK_JABATAN_PEJABAT, SK_PANGKAT_PEJABAT, SK_KOTA_PEJABAT).
 */

/** Nilai konfigurasi pejabat penanda tangan SK dengan bawaan masuk akal. */
function skPejabat() {
  return {
    nama: getConfig('SK_PEJABAT', ''),
    jabatan: getConfig('SK_JABATAN_PEJABAT', 'Direktur RSUD Luwuk'),
    pangkat: getConfig('SK_PANGKAT_PEJABAT', ''),
    kota: getConfig('SK_KOTA_PEJABAT', getConfig('TEMPAT_DIBUAT', CONFIG.TEMPAT_DIBUAT) || 'Luwuk')
  };
}

/** Keterangan angka ke terbilang sederhana (untuk gaji pada SK). */
function terbilang(n) {
  var angka = Math.floor(Number(n) || 0);
  if (angka === 0) return 'Nol';
  var satuan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan',
    'Sepuluh', 'Sebelas'];
  var nama = '';
  var bagian = [];

  function diBawah100(a) {
    if (a < 12) return satuan[a];
    if (a < 20) return satuan[a - 10] + ' Belas';
    return satuan[Math.floor(a / 10)] + ' Puluh' + (a % 10 ? ' ' + satuan[a % 10] : '');
  }

  function tigaDigit(a) {
    var s = '';
    var ratus = Math.floor(a / 100);
    var sisa = a % 100;
    if (ratus === 1) s = 'Seratus';
    else if (ratus > 1) s = satuan[ratus] + ' Ratus';
    if (sisa) s += (s ? ' ' : '') + diBawah100(sisa);
    return s;
  }

  var skala = ['', 'Ribu', 'Juta', 'Miliar', 'Triliun'];
  var bagian = [];
  var i = 0;
  while (angka > 0) {
    var potong = angka % 1000;
    angka = Math.floor(angka / 1000);
    if (potong) {
      var teks = potong < 100 ? diBawah100(potong) : tigaDigit(potong);
      if (i === 1 && potong === 1) teks = 'Seribu';
      bagian.unshift(teks + (skala[i] ? ' ' + skala[i] : ''));
    }
    i++;
  }
  return bagian.join(' ');
}

/** Nomor SK bawaan (bisa diubah setelah file dibuka). */
function nomorSkUsulan(u) {
  var tahun = parseDate(u.diputuskan_at) || new Date();
  var kode = u.jenis === 'KP' ? 'KP' : 'KGB';
  return pad(1, 3) + '/SK.' + kode + '.RSUD-LW/' + tahun.getFullYear();
}

/** Isi (isi/menimbang) SK untuk satu usulan. */
function dataSk(usulanId) {
  var det = detailUsulan(usulanId);
  var u = det.usulan;
  var p = det.pendukung ? det.pendukung.pegawai : null;
  if (!p) throw AppError('Data pegawai untuk usulan ini tidak ditemukan.', 'NOT_FOUND');

  var pej = skPejabat();
  var tgl = parseDate(u.diputuskan_at) || parseDate(u.diajukan_at) || new Date();

  var rinci = {
    pegawai: p,
    usulan: u,
    pejabat: pej,
    jenis: u.jenis,
    nomorSk: nomorSkUsulan(u),
    tanggalSk: formatDateId(tanggal) + ' ' + pad(parseDate(tanggal) ? parseDate(tanggal).getHours() : 0) + ':' + pad(parseDate(tanggal) ? parseDate(tanggal).getMinutes() : 0),
    tempat: pej.kota,
    namaPegawai: p.nama,
    nipPegawai: p.nip || '',
    golLama: u.golongan_lama || '',
    golBaru: u.golongan_baru || '',
    gajiLama: u.gaji_lama || 0,
    gajiBaru: u.gaji_baru || 0,
    gajiLamaTerbilang: terbilang(u.gaji_lama),
    gajiBaruTerbilang: terbilang(u.gaji_baru),
    tmt: u.periode_tmt || '',
    tmtKgbTerakhir: u.tmt_kgb_terakhir || '',
    jabatan: det.pendukung ? det.pendukung.jabatan : '',
    tempatTugas: det.pendukung ? det.pendukung.tempat_tugas : '',
    namaInstansi: getConfig('INSTANSI', CONFIG.INSTANSI),
    nomorSk: nomorSkUsulan(u),
    tanggalSk: formatDateId(tgl)
  };

  if (u.jenis === 'KP') {
    rinci.ringkasan = 'Kenaikan pangkat dari golongan ' + rinci.golLama + ' menjadi ' + rinci.golBaru +
      ' dalam jabatan ' + (rinci.jabatan || '-');
  } else {
    rinci.ringkasan = 'Kenaikan gaji berkala berkala untuk golongan ' + rinci.golLama +
      ' dalam jabatan ' + (rinci.jabatan || '-');
  }
  return rinci;
}

/**
 * HTML untuk pratinjau & cetak SK. Dipakai halaman web app
 * (tampil di modal, bisa langsung dicetak ke PDF oleh browser).
 */
function pratinjauSk(usulanId) {
  var d = dataSk(usulanId);
  var u = d.usulan;

  var menimbang = d.jenis === 'KP'
    ? 'bahwa pengangkatan dan penyesuaian kenaikan pangkat pegawai perlu ditetapkan dengan suatu keputusan Direktur RSUD Luwuk;'
    : 'bahwa berakhirnya masa kerja yang menjadi dasar kenaikan gaji berkala pegawai perlu ditetapkan dengan suatu keputusan Direktur RSUD Luwuk;';

  var isiA = d.jenis === 'KP'
    ? 'Pertama: memberhentikan dan mengangkat pegawai tersebut dalam lampiran keputusan ini menjadi ' + d.namaPegawai + ' ke dalam golongan ruang gaji ' + d.golBaru + ', terhitung mulai tanggal ' + d.tmt + '.'
    : 'Pertama: menetapkan gaji pokok pegawai tersebut menjadi Rp ' + d.gajiBaruTerbilang + ' (' + d.gajiBaru + ') per bulan, golongan ' + d.golLama + ', terhitung mulai tanggal ' + d.tmt + '.';

  var isiB = d.jenis === 'KP'
    ? 'Kedua: perbedaan penghasilan yang timbul akibat keputusan ini akan dibayarkan sesuai ketentuan perundang-undangan yang berlaku.'
    : 'Kedua: pembayaran gaji pokok barulah dapat dibayarkan setelah keputusan ini dijalankan berdasarkan berita acara pelantikan/ penetapan masa kerja.';

  var tanda = d.pejabat.nama && d.pejabat.nama.indexOf('...') !== 0
    ? d.pejabat.nama
    : d.pejabat.nama || '(nama pejabat belum diset — isi SK_PEJABAT pada Config)';

  var html =
    '<div class="sk-dok" style="background:#fff;color:#111;padding:28px 34px;font-family:"Times New Roman",Times,serif;font-size:13.5px;line-height:1.6;text-align:justify">' +
      '<div style="text-align:center;font-size:16px;font-weight:bold;letter-spacing:1px">' + esc(d.namaInstansi) + '</div>' +
      '<div style="text-align:center;font-weight:bold;margin-bottom:4px">SUB BAGIAN KEPEGAWAIAN</div>' +
      '<div style="text-align:center;font-size:12px;margin-bottom:2px">' + esc(d.tempat) + '</div>' +
      '<hr style="border:0;border-top:3px double #000;margin:10px 0 18px">' +

      '<div style="text-align:center;margin-bottom:14px">' +
        '<div style="font-weight:bold;text-decoration:underline">SURAT KEPUTUSAN DIREKTUR</div>' +
        '<div style="font-weight:bold">RSUD LUWUK</div>' +
        '<div>Nomor : ' + esc(d.nomorSk) + '</div>' +
      '</div>' +

      '<div style="text-align:center;font-weight:bold;margin:10px 0">TENTANG</div>' +
      '<div style="text-align:center;font-weight:bold;margin-bottom:12px">' +
        (d.jenis === 'KP' ? 'PENGANGKATAN DAN PENYESUAIAN KENAIKAN PANGKAT PEGAWAI' : 'PENETAPAN KENAIKAN GAJI BERKALA PEGAWAI') +
      '</div>' +

      '<div style="text-align:center;font-weight:bold;margin:10px 0">' + esc(d.namaInstansi).toUpperCase() + '</div>' +

      '<p><b>Menimbang:</b> ' + esc(menimbang) + '</p>' +
      '<p><b>Mengingat:</b> undang-undang dan peraturan perundang-undangan tentang kepegawaian;</p>' +

      '<div style="text-align:center;font-weight:bold;margin:10px 0">MEMUTUSKAN</div>' +

      '<p><b>Menetapkan:</b></p>' +
      '<p>' + esc(isiA) + '</p>' +
      '<p>' + esc(isiB) + '</p>' +

      '<table style="margin-top:14px;border-collapse:collapse;width:100%;font-size:12.5px">' +
        '<tr><td style="border:1px solid #999;padding:5px 7px;width:34%">Nama</td><td style="border:1px solid #999;padding:5px 7px">: ' + esc(d.namaPegawai) + '</td></tr>' +
        '<tr><td style="border:1px solid #999;padding:5px 7px">NIP</td><td style="border:1px solid #999;padding:5px 7px">: ' + esc(d.nipPegawai || '-') + '</td></tr>' +
        '<tr><td style="border:1px solid #999;padding:5px 7px">Jabatan</td><td style="border:1px solid #999;padding:5px 7px">: ' + esc(d.jabatan || '-') + '</td></tr>' +
        '<tr><td style="border:1px solid #999;padding:5px 7px">Tempat Tugas</td><td style="border:1px solid #999;padding:5px 7px">: ' + esc(d.tempatTugas || '-') + '</td></tr>' +
        (d.jenis === 'KP'
          ? ('<tr><td style="border:1px solid #999;padding:5px 7px">Golongan lama</td><td style="border:1px solid #999;padding:5px 7px">: ' + esc(d.golLama) + '</td></tr>' +
             '<tr><td style="border:1px solid #999;padding:5px 7px">Golongan baru</td><td style="border:1px solid #999;padding:5px 7px">: ' + esc(d.golBaru) + '</td></tr>')
          : ('<tr><td style="border:1px solid #999;padding:5px 7px">Golongan</td><td style="border:1px solid #999;padding:5px 7px">: ' + esc(d.golLama) + '</td></tr>' +
             '<tr><td style="border:1px solid #999;padding:5px 7px">KGB terakhir</td><td style="border:1px solid #999;padding:5px 7px">: ' + esc(d.tmtKgbTerakhir) + '</td></tr>')) +
        '<tr><td style="border:1px solid #999;padding:5px 7px">Gaji lama</td><td style="border:1px solid #999;padding:5px 7px">: Rp ' + esc(d.gajiLama) + '</td></tr>' +
        '<tr><td style="border:1px solid #999;padding:5px 7px">Gaji baru</td><td style="border:1px solid #999;padding:5px 7px">: Rp ' + esc(d.gajiBaru) + '</td></tr>' +
        '<tr><td style="border:1px solid #999;padding:5px 7px">TMT</td><td style="border:1px solid #999;padding:5px 7px">: ' + esc(d.tmt) + '</td></tr>' +
        '<tr><td style="border:1px solid #999;padding:5px 7px">Nomor Usulan</td><td style="border:1px solid #999;padding:5px 7px">: ' + esc(u.nomor_usulan) + '</td></tr>' +
      '</table>' +

      '<div style="margin-top:22px;display:flex;justify-content:space-between">' +
        '<div></div>' +
        '<div style="text-align:left;min-width:250px">' +
          '<div>' + esc(d.tempat) + ', ' + esc(d.tanggalSk) + '</div>' +
          '<div>' + esc(d.pejabat.jabatan) + '</div>' +
          '<div style="height:64px"></div>' +
          '<div style="font-weight:bold;text-decoration:underline">' + esc(tanda) + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  return { html: html, ringkas: d.ringkasan, nomorSk: d.nomorSk, tanggalSk: d.tanggalSk };
}

/**
 * Menyimpan SK sebagai file .doc di Google Drive.
 * Mengembalikan { id, nama, url }.
 */
function cetakSk(usulanId) {
  return withLock(function () {
    var u = repoUsulan().byId(String(usulanId || ''));
    if (!u) throw AppError('Usulan tidak ditemukan.', 'NOT_FOUND');
    if (u.status !== 'DISETUJUI') {
      throw AppError('SK hanya bisa dicetak untuk usulan yang sudah DISETUJUI.', 'STATUS_TIDAK_BENAR');
    }

    var hasil = pratinjauSk(u.id);
    var nama = 'SK-' + (u.jenis === 'KP' ? 'KP' : 'KGB') + '-' +
      String(u.pegawai_id) + '-' + formatDate(new Date()).replace(/-/g, '') + '.doc';

    var dokumen =
      '<html><head><meta charset="utf-8">' +
      '<style>body{font-family:"Times New Roman",Times,serif;font-size:12pt;line-height:1.5}' +
      'table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:5px 7px;font-size:11pt}</style>' +
      '</head><body>' + hasil.html + '</body></html>';

    var file;
    try {
      var folder = folderSk_();
      file = folder.createFile(Utilities.newBlob(dokumen, 'application/msword', nama));
    } catch (e) {
      // Kalau Drive tidak tersedia, tetap kembalikan hasil cetak.
      throw AppError('Gagal menyimpan file ke Drive: ' + e.message, 'DRIVE_ERROR');
    }

    var url = file.getUrl();
    repoUsulan().update(u.id, { file_sk_url: url, file_sk_nama: nama });
    catatLog('EXPORT', 'Usulan', u.id, 'Cetak SK ' + nama + ' untuk usulan ' + u.nomor_usulan, null, { url: url });
    catatRiwayatUsulan(u.id, 'CETAK_SK', 'SK dicetak: ' + nama, null, { url: url, nama: nama });

    return { id: file.getId(), nama: nama, url: url, nomorSk: hasil.nomorSk };
  });
}

/** Folder tujuan SK di Drive (mengikuti ROOT_FOLDER_ID bila diisi). */
function folderSk_() {
  var rootId = getConfig('ROOT_FOLDER_ID', '');
  var root = rootId ? DriveApp.getFolderById(rootId) : DriveApp.getRootFolder();
  var nama = getConfig('FOLDER_SK_NAMA', 'SIMPEG - SK');
  var it = root.searchFolders('title = "' + nama + '"');
  return it.hasNext() ? it.next() : root.createFolder(nama);
}

/** Pratinjau SK sebagai data utuh untuk klien (tanpa Drive). */
function apiPratinjauSk(usulanId) {
  return pratinjauSk(usulanId);
}
