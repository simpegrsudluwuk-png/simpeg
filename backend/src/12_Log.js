/**
 * 12_Log.js
 * Pencatatan aktivitas (audit trail) — setiap perubahan data
 * penting dicatat siapa, kapan, entitas apa, dan apa yang berubah.
 */

/**
 * Catat satu aktivitas.
 * aksi: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'EXPORT' | 'APPROVE' | ...
 */
function catatLog(aksi, entitas, entitasId, keterangan, dataLama, dataBaru) {
  try {
    var u = null;
    try { u = getCurrentUser(); } catch (e) { /* belum login */ }
    repoLog().insert({
      waktu: nowIso(),
      user_id: u ? u.id : '',
      user_nama: u ? u.nama : 'Sistem',
      aksi: String(aksi || '').toUpperCase(),
      entitas: entitas || '',
      entitas_id: entitasId ? String(entitasId) : '',
      keterangan: keterangan || '',
      data_lama: dataLama ? JSON.stringify(dataLama) : '',
      data_baru: dataBaru ? JSON.stringify(dataBaru) : ''
    });
  } catch (e) {
    // Log tidak boleh menjatuhkan proses utama.
    console.log('catatLog gagal: ' + e.message);
  }
}

/** Catat perubahan data dengan diff otomatis (before/after). */
function catatPerubahan(aksi, entitas, entitasId, before, after, keterangan) {
  catatLog(aksi, entitas, entitasId, keterangan || '', before, after);
}

/** Log aktivitas terbaru (untuk halaman admin). */
function recentLogs(limit) {
  var rows = repoLog().all();
  rows.sort(function (a, b) { return String(b.waktu).localeCompare(String(a.waktu)); });
  return rows.slice(0, limit || 100);
}

/** Bersihkan log yang sudah melewati masa retensi (dijalankan trigger). */
function bersihkanLogLama() {
  var hari = toNum(getConfig('RETENSI_LOG_HARI', CONFIG.RETENSI_LOG_HARI), 365);
  if (hari <= 0) return 0;
  var batas = new Date();
  batas.setDate(batas.getDate() - hari);
  var batasIso = formatDate(batas);
  var all = repoLog().all();
  var dihapus = 0;
  all.forEach(function (r) {
    var tgl = String(r.waktu || '').substring(0, 10);
    if (tgl && tgl < batasIso) {
      if (repoLog().remove(r.id)) dihapus++;
    }
  });
  return dihapus;
}
