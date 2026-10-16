/*************************************************************
 * SIMPEG RS - Modul Notifikasi (Dashboard Widget + Kalender + Email KGB)
 *
 * File TERPISAH dari Code.gs, satu project -> bebas memakai konstanta
 * & helper Code.gs (CONFIG, HEADERS, sheet_(), ensureSheet_(),
 * readSheetAsObjects_(), safeReadSheet_(), getKeyValue_(),
 * normalizeId_(), parseDateFlexible_(), formatDateID_(),
 * formatDateISO_(), rowFromObject_()) tanpa import apa pun.
 *
 * ARSITEKTUR (supaya TIDAK membebani performa web app):
 *   1) rebuildTblNotifikasi() -- precompute, dipanggil SEKALI tiap
 *      jam nebeng trigger yang sudah ada (rebuildTblPegawaiTrigger_
 *      di Code.gs, dijalankan setelah rebuildTblPegawai()). Scan
 *      SUMBER MURAH: "Tbl Pegawai" (895 baris, sudah rapi) untuk
 *      SIP/STR, dan kolom "TMT KGB BERIKUTNYA" yang sudah dihitung
 *      rebuildTblPegawai() -- BUKAN scan mentah semua sheet riwayat.
 *      Hasilnya ditulis ke sheet "Tbl Notifikasi" (kecil, cuma baris
 *      yang relevan/dekat jatuh tempo).
 *   2) Dashboard & modal widget CUKUP BACA "Tbl Notifikasi" yang
 *      sudah jadi (getNotifikasiDashboard/getNotifikasiList) --
 *      tidak ada hitung tanggal sama sekali saat halaman dibuka.
 *   3) processNotifikasiHarian_() (efek samping: bikin event
 *      kalender & kirim email) DIJAGA supaya HANYA JALAN 1x/HARI
 *      walau trigger-nya jalan tiap jam (24x/hari) -- pakai penanda
 *      tanggal terakhir proses di PropertiesService. Jadi walau
 *      Tbl Notifikasi ditulis ulang tiap jam, event kalender & email
 *      TIDAK dibuat dobel.
 *
 * JADWAL REMINDER (hari sebelum tanggal target):
 *   - SIP & STR : H-28, H-21, H-14, H-7 (1x per minggu)
 *   - KGB       : H-7, H-6, H-5 (3 hari berturut-turut)
 *   - Email KGB : sekali, tepat di H-7
 *************************************************************/

// ====== 0. KONFIGURASI MODUL INI ===================================

var CONFIG_NOTIF = {
  SHEET_NOTIFIKASI: 'Tbl Notifikasi',

  // Kosongkan ('') untuk pakai kalender utama akun yang menjalankan
  // script (CalendarApp.getDefaultCalendar()). Isi dengan Calendar ID
  // kalau mau pakai kalender khusus, mis. "xxxx@group.calendar.google.com".
  CALENDAR_ID: '',

  EMAIL_SUBJECT_KGB: 'Pemberitahuan Kenaikan Gaji Berkala',

  HEADERS: ['ID ABSEN', 'NAMA', 'JENIS', 'TANGGAL EVENT', 'SISA HARI', 'STATUS EMAIL']
};

// Hari-H sebelum tanggal target dimana reminder (event kalender) dibuat.
var REMINDER_DAYS_ = {
  SIP: [28, 21, 14, 7],
  STR: [28, 21, 14, 7],
  KGB: [7, 6, 5]
};

var LABEL_JENIS_ = {
  SIP: 'Surat Izin Praktik (SIP)',
  STR: 'Surat Tanda Registrasi (STR)',
  KGB: 'Kenaikan Gaji Berkala (KGB)'
};

// ====== 1. PRECOMPUTE "Tbl Notifikasi" (dipanggil tiap jam) =========

function rebuildTblNotifikasi() {
  var pegawaiRows = readSheetAsObjects_(CONFIG.SHEET_PEGAWAI);
  var todayNum = dayNumber_(new Date());
  var out = [];

  function pushIfRelevant(id, nama, jenis, tanggalVal) {
    var d = parseDateFlexible_(tanggalVal);
    if (!d) return;
    var sisaHari = Math.round((dayNumber_(d) - todayNum) / 86400000);
    // Simpan kalau masih dalam jendela relevan: sampai 40 hari ke depan
    // (cukup utk jendela tampilan 30 hari + jadwal reminder H-28), dan
    // sampai 14 hari yang sudah lewat (utk audit "terlewat").
    if (sisaHari > 40 || sisaHari < -14) return;
    out.push({
      'ID ABSEN': id,
      'NAMA': nama,
      'JENIS': jenis,
      'TANGGAL EVENT': formatDateID_(d),
      'SISA HARI': sisaHari,
      'STATUS EMAIL': (jenis === 'KGB') ? 'Belum' : '-'
    });
  }

  pegawaiRows.forEach(function (r) {
    var id = getKeyValue_(r);
    var nama = r['NAMA'];
    pushIfRelevant(id, nama, 'SIP', r['TMT VALID SIP']);
    pushIfRelevant(id, nama, 'STR', r['TMT VALID STR']);
    pushIfRelevant(id, nama, 'KGB', r['TMT KGB BERIKUTNYA']);
  });

  out.sort(function (a, b) { return a['SISA HARI'] - b['SISA HARI']; });

  // Pertahankan status "Terkirim" yang sudah ada sebelum ditimpa, supaya
  // rebuild tiap jam TIDAK me-reset status email KGB yang sudah terkirim
  // (dedup email sebenarnya sudah dijamin oleh guard 1x/hari di
  // processNotifikasiHarian_(), ini cuma jaga-jaga tambahan / audit).
  var prevTerkirim = {};
  try {
    readSheetAsObjects_(CONFIG_NOTIF.SHEET_NOTIFIKASI).forEach(function (r) {
      if (r['STATUS EMAIL'] === 'Terkirim') {
        prevTerkirim[r['ID ABSEN'] + '|' + r['JENIS'] + '|' + r['TANGGAL EVENT']] = true;
      }
    });
  } catch (e) { /* sheet belum ada, biarkan */ }

  out.forEach(function (row) {
    var key = row['ID ABSEN'] + '|' + row['JENIS'] + '|' + row['TANGGAL EVENT'];
    if (prevTerkirim[key]) row['STATUS EMAIL'] = 'Terkirim';
  });

  var sh = ensureSheet_(CONFIG_NOTIF.SHEET_NOTIFIKASI, CONFIG_NOTIF.HEADERS);
  sh.clearContents();
  sh.getRange(1, 1, 1, CONFIG_NOTIF.HEADERS.length).setValues([CONFIG_NOTIF.HEADERS]);
  if (out.length) {
    var values = out.map(function (r) { return rowFromObject_(r, CONFIG_NOTIF.HEADERS); });
    sh.getRange(2, 1, values.length, CONFIG_NOTIF.HEADERS.length).setValues(values);
  }
  sh.setFrozenRows(1);
  return out.length;
}

function dayNumber_(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// ====== 2. PROSES HARIAN: event kalender + email KGB ================
//
// PENTING: dijaga supaya cuma jalan SEKALI per hari kalender, walau
// dipanggil dari trigger yang jalan tiap jam -- tanpa ini, kalau tidak
// dijaga bisa bikin event kalender/email dobel 24x sehari.
function processNotifikasiHarian_() {
  var props = PropertiesService.getScriptProperties();
  var todayKey = formatDateISO_(new Date());
  if (props.getProperty('NOTIF_LAST_RUN') === todayKey) {
    return { skipped: true, reason: 'Sudah diproses hari ini (' + todayKey + ').' };
  }

  var rows = safeReadSheet_(CONFIG_NOTIF.SHEET_NOTIFIKASI);
  var jumlahEvent = 0;
  var jumlahEmail = 0;

  rows.forEach(function (row) {
    var jenis = row['JENIS'];
    var sisaHari = Number(row['SISA HARI']);
    var jadwal = REMINDER_DAYS_[jenis] || [];

    if (jadwal.indexOf(sisaHari) > -1) {
      buatEventKalender_(row);
      jumlahEvent++;
    }

    if (jenis === 'KGB' && sisaHari === 7 && row['STATUS EMAIL'] !== 'Terkirim') {
      var terkirim = kirimEmailKGB_(row);
      if (terkirim) {
        tandaiEmailTerkirim_(row['ID ABSEN'], row['JENIS'], row['TANGGAL EVENT']);
        jumlahEmail++;
      }
    }
  });

  props.setProperty('NOTIF_LAST_RUN', todayKey);
  return { skipped: false, jumlahEvent: jumlahEvent, jumlahEmail: jumlahEmail };
}

function buatEventKalender_(row) {
  var calendar = CONFIG_NOTIF.CALENDAR_ID
    ? CalendarApp.getCalendarById(CONFIG_NOTIF.CALENDAR_ID)
    : CalendarApp.getDefaultCalendar();
  if (!calendar) return;

  var judul = '[' + row['JENIS'] + '] ' + row['NAMA'] +
    (row['SISA HARI'] >= 0 ? ' - H-' + row['SISA HARI'] : '');
  var deskripsi = 'Pengingat ' + (LABEL_JENIS_[row['JENIS']] || row['JENIS']) +
    ' untuk ' + row['NAMA'] + ' (ID Absen ' + row['ID ABSEN'] + ') ' +
    'akan jatuh tempo pada ' + row['TANGGAL EVENT'] + '.';

  try {
    calendar.createAllDayEvent(judul, new Date(), { description: deskripsi });
  } catch (e) {
    // Jangan gagalkan seluruh proses harian hanya karena 1 event gagal
    // dibuat (mis. kuota Calendar API sedang penuh).
  }
}

function kirimEmailKGB_(row) {
  var pegawai = readSheetAsObjects_(CONFIG.SHEET_PEGAWAI).find(function (p) {
    return normalizeId_(getKeyValue_(p)) === normalizeId_(row['ID ABSEN']);
  });
  var email = pegawai ? String(pegawai['EMAIL'] || '').trim() : '';
  if (!email) return false;

  var golongan = (pegawai['GOL'] || '-');
  var body =
    'Yth. ' + row['NAMA'] + ',\n\n' +
    'Kami informasikan bahwa Anda akan menerima Kenaikan Gaji Berkala (KGB) dengan rincian sebagai berikut:\n\n' +
    '   Golongan  : ' + golongan + '\n' +
    '   TMT KGB   : ' + row['TANGGAL EVENT'] + '\n\n' +
    'Mohon menyiapkan berkas terkait bila diperlukan.\n\n' +
    'Hormat kami,\nBagian Kepegawaian';

  try {
    MailApp.sendEmail(email, CONFIG_NOTIF.EMAIL_SUBJECT_KGB, body);
    return true;
  } catch (e) {
    return false;
  }
}

function tandaiEmailTerkirim_(idAbsen, jenis, tanggalEvent) {
  var sh = sheet_(CONFIG_NOTIF.SHEET_NOTIFIKASI);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  var data = sh.getRange(2, 1, lastRow - 1, CONFIG_NOTIF.HEADERS.length).getValues();
  var colEmail = CONFIG_NOTIF.HEADERS.indexOf('STATUS EMAIL');
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(idAbsen) && data[i][2] === jenis && data[i][3] === tanggalEvent) {
      sh.getRange(i + 2, colEmail + 1).setValue('Terkirim');
      break;
    }
  }
}

// ====== 3. API UNTUK FRONTEND (widget Dashboard) ====================

function getNotifikasiDashboard() {
  var rows = safeReadSheet_(CONFIG_NOTIF.SHEET_NOTIFIKASI);
  var now = new Date();
  var bulanIni = now.getMonth();
  var tahunIni = now.getFullYear();

  var kgbBulanIni = rows.filter(function (r) {
    if (r['JENIS'] !== 'KGB') return false;
    var d = parseDateFlexible_(r['TANGGAL EVENT']);
    return d && d.getMonth() === bulanIni && d.getFullYear() === tahunIni;
  }).length;

  var sipAkanBerakhir = rows.filter(function (r) {
    return r['JENIS'] === 'SIP' && Number(r['SISA HARI']) >= 0 && Number(r['SISA HARI']) <= 30;
  }).length;

  var strAkanBerakhir = rows.filter(function (r) {
    return r['JENIS'] === 'STR' && Number(r['SISA HARI']) >= 0 && Number(r['SISA HARI']) <= 30;
  }).length;

  return { kgbBulanIni: kgbBulanIni, sipAkanBerakhir: sipAkanBerakhir, strAkanBerakhir: strAkanBerakhir };
}

// jenis = 'KGB' | 'SIP' | 'STR'
// [FIX] Return JSON.stringify() secara eksplisit -- serializer otomatis
// google.script.run terbukti gagal untuk array-of-object kompleks
// (lihat catatan yang sama persis di getPegawaiDetail() @ Code.gs).
function getNotifikasiList(jenis) {
  var rows = safeReadSheet_(CONFIG_NOTIF.SHEET_NOTIFIKASI);
  var now = new Date();
  var bulanIni = now.getMonth();
  var tahunIni = now.getFullYear();

  var filtered;
  if (jenis === 'KGB') {
    filtered = rows.filter(function (r) {
      if (r['JENIS'] !== 'KGB') return false;
      var d = parseDateFlexible_(r['TANGGAL EVENT']);
      return d && d.getMonth() === bulanIni && d.getFullYear() === tahunIni;
    });
  } else {
    filtered = rows.filter(function (r) {
      return r['JENIS'] === jenis && Number(r['SISA HARI']) >= 0 && Number(r['SISA HARI']) <= 30;
    });
  }

  filtered.sort(function (a, b) { return Number(a['SISA HARI']) - Number(b['SISA HARI']); });

  var out = filtered.map(function (r) {
    return {
      idAbsen: r['ID ABSEN'],
      nama: r['NAMA'],
      tanggal: r['TANGGAL EVENT'],
      sisaHari: Number(r['SISA HARI'])
    };
  });

  return JSON.stringify(out);
}

// ====== 4. STUB: Pembuatan Surat Pengajuan KGB =======================
// Template Doc, folder penyimpanan, dst akan dibahas & diimplementasi
// di tahap berikutnya. Fungsi ini sengaja disiapkan sekarang supaya
// tombol di UI sudah bisa dipasang & diuji, tanpa menunggu detail itu.
function generateSuratPengajuanKGB(idAbsenList) {
  return {
    ok: false,
    message: 'Fitur pembuatan surat pengajuan KGB akan tersedia setelah template Doc & folder penyimpanan ditentukan (' + (idAbsenList || []).length + ' pegawai dipilih).'
  };
}

// ====== 5. UTIL MANUAL UNTUK TES DI EDITOR APPS SCRIPT ===============
// Jalankan salah satu fungsi ini langsung dari editor (tombol Run) utk
// menguji tanpa menunggu trigger jam-an.
function testRebuildNotifikasiManual() {
  var n = rebuildTblNotifikasi();
  Logger.log('Tbl Notifikasi berisi ' + n + ' baris relevan.');
}
function testProsesNotifikasiHarianManual() {
  // Hapus penanda run-hari-ini supaya bisa dites ulang berkali-kali
  // tanpa menunggu besok (JANGAN dipanggil dari trigger produksi).
  PropertiesService.getScriptProperties().deleteProperty('NOTIF_LAST_RUN');
  var res = processNotifikasiHarian_();
  Logger.log(JSON.stringify(res, null, 2));
}