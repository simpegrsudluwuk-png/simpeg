/**
 * 10_Utils.js
 * Kumpulan fungsi pembantu (helper) yang dipakai di seluruh aplikasi SIMPEG.
 * Bagian besar diadaptasi dari pola project E-Filing; ditambah util
 * khusus kepegawaian (parser tanggal ID, validator NIK/NIP/NPWP,
 * hitung umur & masa kerja, pensiun).
 */

/* ======================= ID & WAKTU ======================= */

/** Menghasilkan ID unik. */
function uuid() {
  return Utilities.getUuid();
}

/** ID pendek yang aman untuk ditampilkan. */
function shortId(len) {
  return Utilities.getUuid().replace(/-/g, '').substring(0, len || 8).toUpperCase();
}

/** Waktu sekarang dalam format ISO 'yyyy-MM-dd HH:mm:ss'. */
function nowIso() {
  return formatDateTime(new Date());
}

/** Tanggal hari ini dalam format ISO 'yyyy-MM-dd'. */
function todayIso() {
  return formatDate(new Date());
}

/** Cache zona waktu per eksekusi (PropertiesService relatif mahal). */
var _tzCache = null;

/** Zona waktu aplikasi (default WITA — Luwuk). */
function getTimezone() {
  if (_tzCache) return _tzCache;
  var tz = PropertiesService.getScriptProperties().getProperty('TIMEZONE');
  _tzCache = (tz && String(tz).trim()) || 'Asia/Makassar';
  return _tzCache;
}

/** Hapus cache zona waktu (dipakai bila konfigurasi zona waktu diubah). */
function flushTimezoneCache() { _tzCache = null; }

/**
 * Format tanggal ISO 'yyyy-MM-dd'.
 *
 * PENTING (performa): Utilities.formatDate() sangat mahal — terukur
 * ±25 ms per panggilan pada environment ini. castValue() memanggil
 * fungsi ini untuk SETIAP sel tanggal, jadi memakainya berarti puluhan
 * detik hanya untuk membaca satu tabel (896 baris → ±68 detik) — jauh
 * melewati batas 6 menit GAS bila beberapa tabel dibaca.
 *
 * Karena nilai sudah berupa objek Date atau teks ISO, format dihitung
 * langsung dari komponen kalender zona skrip (Asia/Makassar sesuai
 * appsscript.json) — hasilnya identik dengan Utilities.formatDate.
 */
function formatDate(d) {
  if (!d) return '';
  if (typeof d === 'string') {
    // Fast path: input sudah ISO — tidak perlu parse apa pun.
    var m = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})([T ].*)?$/);
    if (m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    d = parseDate(d);
    if (!d) return '';
  }
  if (typeof d !== 'object') d = parseDate(d);
  if (!d || isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/** Format tanggal & waktu ISO 'yyyy-MM-dd HH:mm:ss' (tanpa Utilities). */
function formatDateTime(d) {
  if (!d) return '';
  if (typeof d === 'string') {
    var m2 = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?.*$/);
    if (m2) {
      return m2[1] + '-' + pad(m2[2]) + '-' + pad(m2[3]) + ' ' +
        pad(m2[4] || 0) + ':' + pad(m2[5] || 0) + ':' + pad(m2[6] || 0);
    }
    d = parseDate(d);
    if (!d) return '';
  }
  if (typeof d !== 'object') d = parseDate(d);
  if (!d || isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
    pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

var BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/** Tambah angka 0 di depan. */
function pad(n, len) {
  var s = String(n);
  len = len || 2;
  while (s.length < len) s = '0' + s;
  return s;
}

/** Angka Romawi (untuk kode bulan pada nomor surat/SK). */
function romawi(n) {
  var map = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  return map[n] || '';
}

/** Nama bulan dalam bahasa Indonesia. */
function namaBulan(n) {
  return BULAN_ID[n - 1] || '';
}

/** Format tanggal untuk tampilan Indonesia: 12 Maret 2026. */
function formatDateId(iso) {
  if (iso === '' || iso === null || iso === undefined) return '-';
  var d = parseDate(iso);
  if (!d) return String(iso); // mis. teks "Seumur Hidup" tampil apa adanya
  return d.getDate() + ' ' + BULAN_ID[d.getMonth()] + ' ' + d.getFullYear();
}

/** Format tanggal & waktu untuk tampilan Indonesia. */
function formatDateTimeId(iso) {
  if (!iso) return '-';
  var dt = formatDateId(iso);
  var d = parseDate(iso);
  if (!d) return dt;
  return dt + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/**
 * Mengubah berbagai bentuk tanggal menjadi objek Date.
 * Mendukung: Date, ISO string, serial number Sheets, "13 Januari 1993"
 * (dengan/ tanpa leading zero), "13/01/1993", "13-01-1993".
 */
function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    // Serial number dari Sheets (1900 epoch)
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  }
  var s = String(value).trim();
  if (!s) return null;

  // ISO: yyyy-mm-dd[ HH:mm[:ss]]
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})([T ](\d{1,2}):(\d{1,2})(:(\d{1,2}))?)?/);
  if (m) {
    var d = new Date(+m[1], +m[2] - 1, +m[3],
      m[5] ? +m[5] : 0, m[6] ? +m[6] : 0, m[8] ? +m[8] : 0);
    return isNaN(d.getTime()) ? null : d;
  }

  // Indonesia: "13 Januari 1993" / "1 Januari 1993"
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    var idx = -1;
    for (var i = 0; i < BULAN_ID.length; i++) {
      if (BULAN_ID[i].toLowerCase() === m[2].toLowerCase()) { idx = i; break; }
    }
    if (idx > -1) {
      var d2 = new Date(+m[3], idx, +m[1]);
      return isNaN(d2.getTime()) ? null : d2;
    }
  }

  // dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    var d3 = new Date(+m[3], +m[2] - 1, +m[1]);
    return isNaN(d3.getTime()) ? null : d3;
  }

  var fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/** Normalisasi berbagai input menjadi Date (alias parseDate). */
function parseDateFlexible(v) {
  return parseDate(v);
}

/**
 * Beberapa kolom TMT (mis. "TMT Valid STR") kadang berisi teks
 * "Seumur Hidup" — artinya tidak pernah kedaluwarsa.
 */
var LIFETIME_KEYWORDS = ['seumur hidup', 'lifetime', 'permanent', 'selamanya'];
function isLifetimeText(val) {
  if (val === null || val === undefined || val === '') return false;
  var s = String(val).trim().toLowerCase();
  for (var i = 0; i < LIFETIME_KEYWORDS.length; i++) {
    if (s.indexOf(LIFETIME_KEYWORDS[i]) > -1) return true;
  }
  return false;
}

/**
 * Nilai waktu untuk sorting/membandingkan.
 * - Tanggal valid  -> timestamp
 * - "Seumur Hidup" -> Infinity (tidak pernah kedaluwarsa)
 * - lainnya/kosong  -> -Infinity
 */
function dateValueForSort(val) {
  var d = parseDate(val);
  if (d) return d.getTime();
  if (isLifetimeText(val)) return Infinity;
  return -Infinity;
}

/** Selisih hari antara dua tanggal (b - a), dibulatkan. */
function diffDays(a, b) {
  var da = parseDate(a);
  var db = parseDate(b);
  if (!da || !db) return null;
  var t = new Date(db.getFullYear(), db.getMonth(), db.getDate()).getTime() -
    new Date(da.getFullYear(), da.getMonth(), da.getDate()).getTime();
  return Math.round(t / 86400000);
}

/* ======================= KONFIGURASI ======================= */

/**
 * Workbook target database: spreadsheet aktif bila ada, jika tidak
 * memakai DEFAULT_SPREADSHEET_ID. Mengembalikan null bila tidak ada —
 * pemanggil harus siap menangani null (konfigurasi awal).
 *
 * Hasilnya di-CACHE per eksekusi: memuat objek spreadsheet itu mahal
 * (bisa >1 detik bila spreadsheet besar), dan `repo().all()` memanggil
 * fungsi ini untuk setiap tabel. Tanpa cache, satu request dashboard
 * memuat spreadsheet belasan kali.
 */
var _wbCache = null;

function getWorkbook() {
  if (_wbCache) return _wbCache;
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) { _wbCache = active; return active; }
  var id = DEFAULT_SPREADSHEET_ID;
  if (id && String(id).trim()) {
    try {
      _wbCache = SpreadsheetApp.openById(String(id).trim());
      return _wbCache;
    } catch (e) {
      return null;
    }
  }
  return null;
}

/** Hapus cache workbook (dipakai bila konfigurasi spreadsheet berubah). */
function flushWorkbookCache() { _wbCache = null; }

/** Baca konfigurasi dari sheet "Config" (cache 5 menit). */
function getConfig(key, fallback) {
  var cache = CacheService.getScriptCache();
  var ck = 'cfg:' + key;
  var cached = cache.get(ck);
  if (cached !== null) return cached;

  var val = null;
  try {
    var ss = getWorkbook();
    var sheet = ss && ss.getSheetByName('Config');
    if (sheet && key) {
      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim() === key) { val = data[i][1]; break; }
      }
    }
  } catch (e) {
    val = null;
  }

  if (val === null || val === undefined) val = fallback;

  if (val !== undefined && val !== null) {
    try { cache.put(ck, String(val), 300); } catch (e) { /* cache penuh */ }
  }
  return (val === undefined) ? null : val;
}

/** Simpan konfigurasi ke sheet Config. */
function setConfig(key, value, keterangan) {
  var ss = getWorkbook();
  if (!ss) throw AppError('Spreadsheet database tidak dapat diakses.', 'CONFIG_MISSING');
  var sheet = ss.getSheetByName('Config') || ss.insertSheet('Config');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['key', 'value', 'keterangan', 'updated_at']);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#e2e8f0');
  }
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) {
      sheet.getRange(i + 1, 2).setValue(value == null ? '' : value);
      sheet.getRange(i + 1, 4).setValue(nowIso());
      if (keterangan) sheet.getRange(i + 1, 3).setValue(keterangan);
      CacheService.getScriptCache().remove('cfg:' + key);
      return;
    }
  }
  sheet.appendRow([key, value == null ? '' : value, keterangan || '', nowIso()]);
  CacheService.getScriptCache().remove('cfg:' + key);
}

/** Hapus cache konfigurasi. */
function flushConfigCache() {
  var cache = CacheService.getScriptCache();
  var keys = cache.getKeys ? cache.getKeys() : [];
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].indexOf('cfg:') === 0) cache.remove(keys[i]);
  }
}

/* ======================= UTIL UMUM ======================= */

/** Nilai boolean yang toleran terhadap string 'true'/'false'/'1'. */
function toBool(v) {
  if (v === true || v === 1) return true;
  if (!v) return false;
  var s = String(v).toLowerCase().trim();
  return s === 'true' || s === '1' || s === 'ya' || s === 'yes' || s === 'y';
}

/** Normalisasi angka. */
function toNum(v, def) {
  if (v === '' || v === null || v === undefined) return (def || 0);
  var n = Number(v);
  return isNaN(n) ? (def || 0) : n;
}

/** Escape karakter regex. */
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Membuat slug nama folder/file yang aman untuk Drive. */
function slugify(str, maxLen) {
  maxLen = maxLen || 80;
  return String(str || '')
    .replace(/[\\/:*?"<>|#%&{}$!'@+=`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLen);
}

/** Deep clone objek (JSON-safe). */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Selisih dua objek (untuk audit trail). */
function diff(before, after) {
  var out = {};
  if (!before) return clone(after || {});
  if (!after) return {};
  Object.keys(after).forEach(function (k) {
    var a = before[k] === undefined ? null : before[k];
    var b = after[k] === undefined ? null : after[k];
    if (String(a) !== String(b)) {
      out[k] = { lama: a, baru: b };
    }
  });
  return out;
}

/** Membagi array menjadi potongan-potongan kecil. */
function chunk(arr, size) {
  size = size || 100;
  var out = [];
  for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Kelompokkan array berdasarkan properti. */
function groupBy(arr, key) {
  return (arr || []).reduce(function (acc, x) {
    var k = key in x ? x[key] : '_';
    (acc[k] = acc[k] || []).push(x);
    return acc;
  }, {});
}

/** Menjumlahkan nilai properti. */
function sumBy(arr, key) {
  return (arr || []).reduce(function (t, x) { return t + toNum(x[key]); }, 0);
}

/** Inisial dari nama (untuk avatar). */
function initials(nama) {
  if (!nama) return '?';
  var parts = String(nama).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Format angka menjadi rupiah: 2858800 -> "Rp 2.858.800". */
function formatRupiah(v) {
  var n = toNum(v, 0);
  if (!n) return '';
  var s = String(Math.round(n));
  var out = '';
  var count = 0;
  for (var i = s.length - 1; i >= 0; i--) {
    out = s[i] + out;
    count++;
    if (count % 3 === 0 && i > 0) out = '.' + out;
  }
  return 'Rp ' + out;
}

/** Membungkus hasil untuk dikirim ke klien. */
function ok(data, message) {
  return { success: true, data: data === undefined ? null : data, message: message || null };
}

/** Membungkus error. */
function fail(error, code) {
  var msg = (error && error.message) ? error.message : String(error);
  return { success: false, error: msg, code: code || 'ERROR' };
}

/** Membuat error berstatus tertentu (untuk membedakan 403/404). */
function AppError(message, code) {
  var e = new Error(message);
  e.appCode = code || 'APP_ERROR';
  return e;
}

/** Mengunci operasi tulis agar aman dari race condition. */
function withLock(fn, timeoutMs) {
  var lock = LockService.getScriptLock();
  if (lock.tryLock(timeoutMs || 30000)) {
    try { return fn(); }
    finally { lock.releaseLock(); }
  }
  throw AppError('Sistem sedang sibuk, silakan coba beberapa saat lagi.', 'LOCKED');
}

/* ======================= UTIL KEPEGAWAIAN ======================= */

/**
 * Normalisasi NIK: buang spasi/titik, perbaiki kerusakan format
 * ilmiah ("7,20105E+15" -> ""), kembalikan maksimal 16 digit angka.
 */
function normalisasiNIK(val) {
  if (val === null || val === undefined) return '';
  var s = String(val).trim();
  if (!s) return '';
  // Kerusakan format angka ilmiah (mis. "7,20105E+15") -> dianggap hilang
  if (/^[\d,.]+e\+?\d*$/i.test(s)) return '';
  return s.replace(/[^0-9]/g, '');
}

/** Validasi NIK: 16 digit. */
function validasiNIK(val) {
  var n = normalisasiNIK(val);
  return n.length === 16;
}

/**
 * Normalisasi NIP: buang karakter non-angka, rapikan spasi.
 * Nilai non-angka (mis. "Non DB BKN", "Honor") dikembalikan apa
 * adanya sebagai teks (bukan dummy) supaya tidak disalahartikan.
 */
function normalisasiNIP(val) {
  if (val === null || val === undefined) return '';
  var s = String(val).trim();
  if (!s) return '';
  var digits = s.replace(/[^0-9]/g, '');
  if (digits.length >= 15 && s.replace(/[^0-9]/g, '').length === digits.length) {
    return digits; // mis. "196603311996031002" (18 digit tanpa spasi)
  }
  // mengandung huruf/teks -> bukan NIP numerik; kembalikan sebagai catatan
  if (/[A-Za-z]/.test(s)) return s;
  return s.replace(/\s+/g, ' ').trim();
}

/** Validasi NIP numerik: 18 digit (format BKN berspasi dibersihkan dulu). */
function validasiNIP(val) {
  var s = String(val || '').trim();
  var digits = s.replace(/[^0-9]/g, '');
  return digits.length === 18 && !/[A-Za-z]/.test(s);
}

/**
 * Normalisasi NPWP: buang spasi & titik. Format lama
 * "93.734.716.9-832.000" -> "937347169832000" (15 digit).
 */
function normalisasiNPWP(val) {
  if (val === null || val === undefined) return '';
  var s = String(val).trim();
  if (!s || s === '-' || s.toUpperCase() === '#N/A') return '';
  return s.replace(/[^0-9]/g, '');
}

/** Validasi NPWP: 15 digit. */
function validasiNPWP(val) {
  return normalisasiNPWP(val).length === 15;
}

/**
 * Normalisasi email: lowercase, trim. Nilai error spreadsheet
 * ("#N/A", "#ERROR!", "#REF!") atau teks jelas bukan email -> ''.
 */
function normalisasiEmail(val) {
  if (val === null || val === undefined) return '';
  var s = String(val).trim().toLowerCase();
  if (!s || s.indexOf('#') === 0) return '';
  if (s.indexOf('@') === -1) return '';
  return s.replace(/\s+/g, '');
}

/** Validasi email sederhana. */
function validasiEmail(val) {
  var s = normalisasiEmail(val);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/**
 * Normalisasi nomor HP: buang spasi/strip. Nilai error spreadsheet
 * ("#N/A", "#ERROR!") -> ''. Awalan 0 -> 62 (format fonnte/generic).
 */
function normalisasiHp(val, keFormat62) {
  if (val === null || val === undefined) return '';
  var s = String(val).trim();
  if (!s || s.indexOf('#') === 0 || s === '-') return '';
  var digits = s.replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (keFormat62) {
    if (digits.indexOf('62') === 0) return digits;
    if (digits.indexOf('0') === 0) return '62' + digits.substring(1);
  }
  return digits;
}

/**
 * Hitung umur (tahun) dari tanggal lahir pada tanggal acuan
 * (default hari ini).
 */
function hitungUmur(tanggalLahir, acuan) {
  var d = parseDate(tanggalLahir);
  if (!d) return null;
  var ref = parseDate(acuan) || new Date();
  var umur = ref.getFullYear() - d.getFullYear();
  var m = ref.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < d.getDate())) umur--;
  return umur;
}

/**
 * Hitung masa kerja dari TMT: { tahun, bulan, teks }.
 * teks -> "12 Tahun, 3 Bulan" (konsisten dengan tampilan app lama).
 */
function hitungMasaKerja(tmt, acuan) {
  var d = parseDate(tmt);
  if (!d) return null;
  var ref = parseDate(acuan) || new Date();
  var bulan = (ref.getFullYear() - d.getFullYear()) * 12 + (ref.getMonth() - d.getMonth());
  if (ref.getDate() < d.getDate()) bulan--;
  if (bulan < 0) bulan = 0;
  var tahun = Math.floor(bulan / 12);
  var sisa = bulan % 12;
  return {
    tahun: tahun,
    bulan: sisa,
    teks: tahun + ' Tahun, ' + sisa + ' Bulan'
  };
}

/**
 * Tanggal perkiraan pensiun (DHT): tanggal lahir + batas usia.
 * Batas usia: override per pegawai > Config (USIA_PENSIUN_JSON) >
 * default per jenis pegawai di CONFIG.USIA_PENSIUN.
 */
function hitungTanggalPensiun(pegawai, jenisPegawai) {
  if (!pegawai) return null;
  var lahir = parseDate(pegawai.tanggal_lahir);
  if (!lahir) return null;

  var usia = pegawai.batas_usia_pensiun;
  if (!usia || usia <= 0) usia = usiaPensiunDefault(jenisPegawai);
  if (!usia || usia <= 0) return null;

  var d = new Date(lahir.getFullYear() + Number(usia), lahir.getMonth(), lahir.getDate());
  // Pensiun jatuh tempo akhir bulan berikutnya (praktik umum: hari pertama
  // bulan sesudah ulang tahun ke-N); sederhanakan: tepat pada ultah ke-N.
  return d;
}

/** Usia pensiun default (baca Config dulu, fallback CONFIG.USIA_PENSIUN). */
function usiaPensiunDefault(jenisPegawai) {
  var raw = getConfig('USIA_PENSIUN_JSON', '');
  var map = CONFIG.USIA_PENSIUN;
  if (raw) {
    try {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') map = parsed;
    } catch (e) { /* pakai default */ }
  }
  if (jenisPegawai && map[jenisPegawai]) return Number(map[jenisPegawai]);
  return Number(map['default'] || 58);
}

/** Mask NIP untuk tampilan: "196603311996031002" -> "1966 0331 1996 1 002". */
function maskNip(nip) {
  var s = String(nip || '').trim();
  var d = s.replace(/[^0-9]/g, '');
  if (d.length !== 18) return s;
  return d.substring(0, 4) + ' ' + d.substring(4, 8) + ' ' + d.substring(8, 12) + ' ' +
    d.substring(12, 13) + ' ' + d.substring(13);
}

/** Mask email untuk tampilan publik. */
function maskEmail(email) {
  var s = String(email || '').trim();
  var at = s.indexOf('@');
  if (at < 3) return s;
  return s.substring(0, 2) + '***' + s.substring(at);
}

/** Mask nomor HP. */
function maskHp(hp) {
  var s = String(hp || '').trim();
  if (s.length < 6) return s;
  return s.substring(0, 4) + '****' + s.substring(s.length - 3);
}
