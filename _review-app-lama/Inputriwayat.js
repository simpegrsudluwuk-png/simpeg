/*************************************************************
 * SIMPEG RS - Modul Input Tabel Riwayat
 * (Status / Pendidikan / Pangkat & Jabatan / Tempat Tugas / SIP-STR)
 *
 * File TERPISAH dari Code.gs. Di Google Apps Script, semua file
 * .gs dalam SATU project otomatis berbagi scope global -- jadi
 * file ini bebas memakai konstanta & helper yang sudah ada di
 * Code.gs (CONFIG, HEADERS, RWYT_CONFIG_, ensureSheet_(),
 * appendRowByHeaders_(), readSheetAsObjects_(), getKeyValue_(),
 * normalizeId_(), withLock_(), rebuildTblPegawai()) tanpa import
 * apa pun. Cukup taruh file ini di project Apps Script yang sama.
 *
 * BEDA dengan saveRiwayat() yang sudah ada di Code.gs:
 *   - saveRiwayat(kind, payload, rowNumber)  -> simpan SATU baris
 *     riwayat SATU jenis (dipakai di tab per-jenis pada halaman
 *     Profil Pegawai), rebuild Tbl Pegawai tiap kali dipanggil.
 *   - saveRiwayatBulk() di file ini          -> simpan BEBERAPA
 *     jenis riwayat sekaligus (Status + Pend + Pangkat + T4 Tugas
 *     + SIP-STR) dalam SATU kali submit dari menu "Input Riwayat",
 *     lalu rebuild Tbl Pegawai HANYA SEKALI di akhir -- lebih
 *     ringan saat user input banyak riwayat untuk 1 pegawai
 *     sekaligus.
 *
 * Fungsi yang diekspos ke frontend (dipanggil via google.script.run):
 *   - searchPegawaiForRiwayat(query)   -> untuk kotak pencarian
 *                                          pilih pegawai
 *   - saveRiwayatBulk(idAbsen, sections) -> simpan riwayat
 *************************************************************/

// ====== 1. PENCARIAN PEGAWAI UNTUK DIPILIH =========================
//
// Sengaja membaca dari "Tbl Bio" (BUKAN "Tbl Pegawai"), supaya
// pegawai yang baru saja disimpan lewat menu "Tambah Pegawai" TETAP
// bisa langsung dicari & diberi riwayat di sini, walaupun tombol
// "Update Tabel Pegawai" belum sempat diklik (Tbl Pegawai belum rebuild).
function searchPegawaiForRiwayat(query) {
  var bioList = readSheetAsObjects_(CONFIG.SHEET_BIO);
  var q = String(query || '').trim().toLowerCase();

  var filtered = !q ? bioList : bioList.filter(function (r) {
    var id = String(getKeyValue_(r) || '').toLowerCase();
    var nama = String(r['NAMA'] || '').toLowerCase();
    return id.indexOf(q) > -1 || nama.indexOf(q) > -1;
  });

  return filtered.slice(0, 30).map(function (r) {
    return { 'ID ABSEN': getKeyValue_(r), 'NAMA': r['NAMA'] || '' };
  });
}

// ====== 2. SIMPAN BEBERAPA JENIS RIWAYAT SEKALIGUS =================
//
// sections = {
//   status:   { 'STATUS PEGAWAI': 'Aktif', ... },   // semua opsional --
//   pend:     { ... },                               // bagian yang tidak
//   pangkat:  { ... },                               // dikirim / semua
//   t4tugas:  { ... },                               // fieldnya kosong
//   sipstr:   { ... }                                // akan DILEWATI
// }
// return = { ok: true, savedCount: <jumlah bagian yang benar2 tersimpan> }
function saveRiwayatBulk(idAbsen, sections) {
  return withLock_(function () {
    var id = String(idAbsen || '').trim();
    if (!id) throw new Error('Pilih pegawai terlebih dahulu.');
    if (!sections || typeof sections !== 'object') {
      throw new Error('Tidak ada data riwayat yang dikirim.');
    }

    var idNorm = normalizeId_(id);
    var bio = readSheetAsObjects_(CONFIG.SHEET_BIO)
      .find(function (r) { return normalizeId_(getKeyValue_(r)) === idNorm; });
    if (!bio) throw new Error('Pegawai dengan ID Absen "' + id + '" tidak ditemukan di Tbl Bio.');

    var kinds = ['status', 'pend', 'pangkat', 't4tugas', 'sipstr', 'kgb'];
    var savedCount = 0;

    kinds.forEach(function (kind) {
      var data = sections[kind];
      if (!data) return;
      var hasValue = Object.keys(data).some(function (k) {
        return k !== CONFIG.KEY_COL && k !== 'NAMA' && String(data[k] || '').trim() !== '';
      });
      if (!hasValue) return; // bagian dikosongkan user -- lewati, jangan tulis baris kosong

      var cfg = RWYT_CONFIG_[kind];
      if (!cfg) throw new Error('Jenis riwayat tidak dikenal: ' + kind);
      var sh = ensureSheet_(CONFIG[cfg.sheet], HEADERS[cfg.headers]);

      data[CONFIG.KEY_COL] = id;
      data['NAMA'] = bio['NAMA'];
      appendRowByHeaders_(sh, data);
      savedCount++;
    });

    if (!savedCount) {
      throw new Error('Isi minimal satu bagian riwayat sebelum menyimpan.');
    }

    // Rebuild SEKALI di akhir (bukan per-bagian) -- lihat catatan
    // perbandingan dengan saveRiwayat() di komentar atas file ini.
    rebuildTblPegawai();
    return { ok: true, savedCount: savedCount };
  });
}