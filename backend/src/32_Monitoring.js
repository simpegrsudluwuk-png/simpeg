/**
 * 32_Monitoring.js
 * Mesin pemantauan tenggat: SIP, STR, KGB, dan Pensiun (DHT).
 *
 * Sumber data (semua sudah ternormalisasi dari fase migrasi):
 *   - SIP/STR : tabel Dokumen (jenis = SIP/STR), masa berlaku tmt_valid
 *               (teks "Seumur Hidup" = tidak pernah kedaluwarsa)
 *   - KGB     : riwayat KGB terakhir + 2 tahun = perkiraan KGB berikutnya
 *   - Pensiun : tanggal lahir + batas usia per jenis pegawai
 */

/** Ambang hari dari Config (comma-list) dengan fallback ke CONFIG. */
function ambangHari_(configKey, defaultArr) {
  var raw = getConfig(configKey, '');
  if (raw) {
    var arr = String(raw).split(',')
      .map(function (s) { return parseInt(s.trim(), 10); })
      .filter(function (n) { return !isNaN(n) && n > 0; });
    if (arr.length) return arr;
  }
  return defaultArr;
}

/** Cari baris Dokumen masa berlaku terdekat dari sejumlah baris. */
function validTerdekat_(rows) {
  var today = new Date();
  var best = null, bestT = -Infinity;
  rows.forEach(function (r) {
    var v = r.tmt_valid;
    if (isLifetimeText(v)) return; // Seumur Hidup: tidak perlu dipantau
    var d = parseDate(v);
    if (!d) return;
    var t = d.getTime();
    if (t > bestT) { bestT = t; best = r; }
  });
  void today;
  return best;
}

/**
 * Data monitoring lengkap (dipakai dashboard & halaman Monitoring).
 */
function dataMonitoring(acuan) {
  acuan = acuan || new Date();
  var ambangSip = ambangHari_('NOTIF_SIP_HARI', CONFIG.NOTIF_SIP_HARI);
  var ambangStr = ambangHari_('NOTIF_STR_HARI', CONFIG.NOTIF_STR_HARI);
  var ambangKgb = ambangHari_('NOTIF_KGB_HARI', CONFIG.NOTIF_KGB_HARI);
  var ambangDht = ambangHari_('NOTIF_DHT_HARI', CONFIG.NOTIF_DHT_HARI);

  var pegawai = {};
  repoPegawai().all().forEach(function (p) { pegawai[String(p.id)] = p; });

  var mStatus = riwayatByPegawai_('RiwayatStatus');
  var mJabatan = riwayatByPegawai_('RiwayatJabatan');

  function infoPegawai(id) {
    var p = pegawai[String(id)] || {};
    var status = terbaru_(mStatus[String(id)], 'tmt_status');
    var jab = terbaru_(mJabatan[String(id)], 'tmt_tempat_tugas');
    return {
      id: id,
      nama: p.nama || '(tak dikenal)',
      jenis_pegawai: status ? status.jenis_pegawai : '',
      tempat_tugas: jab ? jab.tempat_tugas : '',
      jabatan: jab ? jab.jabatan : ''
    };
  }

  // ---------- SIP & STR ----------
  var sipExpired = [], sipAkan = [], strExpired = [], strAkan = [];
  repoDokumen().all().forEach(function (d) {
    if (d.jenis !== 'SIP' && d.jenis !== 'STR') return;
    if (!d.tmt_valid || isLifetimeText(d.tmt_valid)) return; // Seumur Hidup / kosong
    var tgl = parseDate(d.tmt_valid);
    if (!tgl) return;
    var sisa = diffDays(acuan, tgl);
    var ambang = Math.max.apply(null, d.jenis === 'SIP' ? ambangSip : ambangStr);
    var item = {
      pegawai_id: d.pegawai_id,
      pegawai: infoPegawai(d.pegawai_id),
      nomor: d.nomor || '',
      tmt_valid: d.tmt_valid,
      sisa_hari: sisa
    };
    if (sisa < 0) {
      if (d.jenis === 'SIP') sipExpired.push(item); else strExpired.push(item);
    } else if (sisa <= ambang) {
      if (d.jenis === 'SIP') sipAkan.push(item); else strAkan.push(item);
    }
  });
  var urutNaik = function (a, b) { return a.sisa_hari - b.sisa_hari; };
  sipAkan.sort(urutNaik); strAkan.sort(urutNaik);
  sipExpired.sort(function (a, b) { return b.sisa_hari - a.sisa_hari; });
  strExpired.sort(function (a, b) { return b.sisa_hari - a.sisa_hari; });

  // ---------- KGB berikutnya (TMT terakhir + 2 tahun) ----------
  var kgbList = [];
  var mKgb = riwayatByPegawai_('RiwayatKGB');
  Object.keys(mKgb).forEach(function (pid) {
    var terakhir = terbaru_(mKgb[pid], 'tmt_kgb');
    if (!terakhir || !terakhir.tmt_kgb) return;
    var d = parseDate(terakhir.tmt_kgb);
    if (!d) return;
    var berikut = new Date(d.getFullYear() + 2, d.getMonth(), d.getDate());
    var sisa = diffDays(acuan, berikut);
    var ambang = Math.max.apply(null, ambangKgb);
    if (sisa > ambang) return;
    kgbList.push({
      pegawai_id: pid,
      pegawai: infoPegawai(pid),
      tmt_kgb_terakhir: terakhir.tmt_kgb,
      tmt_kgb_berikut: formatDate(berikut),
      sisa_hari: sisa
    });
  });
  kgbList.sort(urutNaik);

  // ---------- DHT / Pensiun ----------
  var dhtList = [];
  var ambangDhtMax = Math.max.apply(null, ambangDht);
  Object.keys(pegawai).forEach(function (pid) {
    var p = pegawai[pid];
    if (!p.tanggal_lahir) return;
    var jenis = terbaru_(mStatus[String(p.id)], 'tmt_status');
    var tglPensiun = hitungTanggalPensiun(p, jenis ? jenis.jenis_pegawai : '');
    if (!tglPensiun) return;
    var sisa = diffDays(acuan, tglPensiun);
    if (sisa > ambangDhtMax) return;
    var jab = terbaru_(mJabatan[String(p.id)], 'tmt_tempat_tugas');
    dhtList.push({
      pegawai_id: p.id,
      pegawai: {
        id: p.id, nama: p.nama,
        jenis_pegawai: jenis ? jenis.jenis_pegawai : '',
        tempat_tugas: jab ? jab.tempat_tugas : '',
        jabatan: jab ? jab.jabatan : ''
      },
      tanggal_lahir: p.tanggal_lahir,
      tanggal_pensiun: formatDate(tglPensiun),
      sisa_hari: sisa
    });
  });
  dhtList.sort(urutNaik);

  // ---------- Ringkasan ----------
  var bulanIni = acuan.getMonth(), tahunIni = acuan.getFullYear();
  function bulanIniCount(list, field) {
    return list.filter(function (x) {
      var d = parseDate(x[field]);
      return d && d.getMonth() === bulanIni && d.getFullYear() === tahunIni;
    }).length;
  }
  var ringkas = {
    sipExpired: sipExpired.length,
    sipAkanBerakhir: sipAkan.length,
    strExpired: strExpired.length,
    strAkanBerakhir: strAkan.length,
    kgbMendekati: kgbList.length,
    kgbBulanIni: bulanIniCount(kgbList, 'tmt_kgb_berikut'),
    dhtMendekati: dhtList.length,
    dhtTahunIni: dhtList.filter(function (x) {
      var d = parseDate(x.tanggal_pensiun);
      return d && d.getFullYear() === tahunIni;
    }).length,
    totalPegawai: repoPegawai().count()
  };

  return {
    generatedAt: formatDateTime(acuan),
    ambang: { sip: ambangSip, str: ambangStr, kgb: ambangKgb, dht: ambangDht },
    ringkas: ringkas,
    sip: { akanBerakhir: sipAkan, sudahExpired: sipExpired },
    str: { akanBerakhir: strAkan, sudahExpired: strExpired },
    kgb: kgbList,
    pensiun: dhtList
  };
}
