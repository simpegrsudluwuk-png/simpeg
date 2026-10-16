/**
 * 40_Dashboard.js
 * Statistik ringkas untuk halaman Dashboard + ringkasan monitoring.
 * Hasil di-cache 5 menit supaya halaman tidak menghitung ulang
 * ±900 baris setiap kali dibuka.
 */

/** Hitung kemunculan nilai kategori (case-insensitive, trim). */
function counter_(canonicalList) {
  var counts = {}, labelForKey = {};
  return {
    bump: function (raw) {
      var trimmed = (raw === null || raw === undefined) ? '' : String(raw).replace(/\s+/g, ' ').trim();
      var key = trimmed ? trimmed.toLowerCase() : '__empty__';
      if (!labelForKey[key]) {
        var canon = null;
        if (canonicalList) {
          canon = canonicalList.filter(function (c) {
            return String(c).trim().toLowerCase() === key;
          })[0];
        }
        labelForKey[key] = canon || (trimmed || '(Tidak diisi)');
      }
      counts[labelForKey[key]] = (counts[labelForKey[key]] || 0) + 1;
    },
    result: function () { return counts; }
  };
}

function hitungStatistik(semua) {
  var cGender = counter_(CONFIG.OPSI_JENIS_KELAMIN);
  var cAgama = counter_(CONFIG.OPSI_AGAMA);
  var cJenis = counter_(CONFIG.OPSI_JENIS_PEGAWAI);
  var cPend = counter_(CONFIG.OPSI_TINGKAT_PEND);
  var cUnit = counter_(null);
  var cJabatan = counter_(null);
  var cGol = counter_(null);
  var ageBuckets = {};

  semua.forEach(function (p) {
    cGender.bump(p.jenis_kelamin);
    cAgama.bump(p.agama);
    cJenis.bump(p.jenis_pegawai);
    cPend.bump(p.tingkat_pend);
    cUnit.bump(p.tempat_tugas);
    cJabatan.bump(p.jabatan);
    if (p.gol) cGol.bump(p.gol);

    var umur = p.umur;
    var bucket = '(N/A)';
    if (typeof umur === 'number') {
      if (umur < 25) bucket = '< 25';
      else if (umur < 35) bucket = '25-34';
      else if (umur < 45) bucket = '35-44';
      else if (umur < 55) bucket = '45-54';
      else bucket = '55+';
    }
    ageBuckets[bucket] = (ageBuckets[bucket] || 0) + 1;
  });

  function topN(obj, n) {
    var entries = Object.keys(obj).map(function (k) { return [k, obj[k]]; });
    entries.sort(function (a, b) { return b[1] - a[1]; });
    return entries.slice(0, n);
  }

  return {
    total: semua.length,
    byGender: cGender.result(),
    byAgama: cAgama.result(),
    byJenisPegawai: cJenis.result(),
    byTingkatPend: cPend.result(),
    byTempatTugas: cUnit.result(),
    byJabatan: cJabatan.result(),
    byGolongan: cGol.result(),
    ageBuckets: ageBuckets,
    topUnit: topN(cUnit.result(), 10),
    topJabatan: topN(cJabatan.result(), 10)
  };
}

/** Data dashboard (statistik + ringkasan monitoring), cache 5 menit. */
function getDashboardData() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('dash:v1');
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* hitung ulang */ }
  }

  var semua = semuaPegawaiLengkap_();
  var statistik = hitungStatistik(semua);
  var mon = dataMonitoring();

  var hasil = {
    statistik: statistik,
    monitoring: mon.ringkas,
    generatedAt: nowIso()
  };

  try { cache.put('dash:v1', JSON.stringify(hasil), 300); } catch (e) { /* cache penuh */ }
  return hasil;
}

/** Hapus cache dashboard (dipanggil setelah data berubah). */
function flushDashboardCache() {
  try { CacheService.getScriptCache().remove('dash:v1'); } catch (e) { /* ignore */ }
}
