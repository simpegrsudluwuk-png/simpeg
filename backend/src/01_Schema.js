/**
 * 01_Schema.js
 * Definisi struktur seluruh worksheet (tabel) pada spreadsheet SIMPEG.
 *
 * Setiap kolom didefinisikan sebagai objek:
 *   { key, label, type, required, unique, options, default }
 *
 * type: string | number | date | datetime | bool | json | ref
 *   date    -> disimpan sebagai teks ISO 'yyyy-MM-dd'
 *   datetime-> disimpan sebagai teks ISO 'yyyy-MM-dd HH:mm:ss'
 *   json    -> disimpan sebagai string JSON
 *   ref     -> foreign key (id dari sheet lain)
 *
 * Model data mengikuti aplikasi lama (Tbl Bio + riwayat per aspek),
 * tetapi ternormalisasi: satu sheet per entitas, tanpa sheet hasil
 * formula (=QUERY) di tengah-tengah seperti Tbl Profil/Tbl Dashboard.
 */

var SHEETS = {

  /* ------------------------------------------------------------------ */
  /* 1. Konfigurasi key/value                                            */
  /* ------------------------------------------------------------------ */
  Config: [
    { key: 'key', label: 'Key', type: 'string', required: true, unique: true },
    { key: 'value', label: 'Value', type: 'string' },
    { key: 'keterangan', label: 'Keterangan', type: 'string' },
    { key: 'updated_at', label: 'Diubah', type: 'datetime' }
  ],

  /* ------------------------------------------------------------------ */
  /* 2. Pengguna aplikasi                                                */
  /* ------------------------------------------------------------------ */
  Users: [
    { key: 'id', label: 'ID', type: 'string', unique: true },
    { key: 'nip', label: 'NIP', type: 'string' },
    { key: 'nama', label: 'Nama Lengkap', type: 'string', required: true },
    { key: 'email', label: 'Email Google', type: 'string', required: true, unique: true },
    { key: 'jabatan', label: 'Jabatan', type: 'string' },
    { key: 'role', label: 'Role', type: 'string', required: true, options: Object.keys(ROLES) },
    { key: 'unit_id', label: 'Unit Kerja', type: 'ref', ref: 'UnitKerja' },
    { key: 'telepon', label: 'Telepon', type: 'string' },
    { key: 'foto_url', label: 'Foto URL', type: 'string' },
    { key: 'aktif', label: 'Aktif', type: 'bool', default: true },
    { key: 'terakhir_login', label: 'Login Terakhir', type: 'datetime' },
    { key: 'created_at', label: 'Dibuat', type: 'datetime' },
    { key: 'updated_at', label: 'Diubah', type: 'datetime' }
  ],

  /* ------------------------------------------------------------------ */
  /* 3. Unit kerja / tempat tugas                                        */
  /* ------------------------------------------------------------------ */
  UnitKerja: [
    { key: 'id', label: 'ID', type: 'string', unique: true },
    { key: 'kode', label: 'Kode', type: 'string', required: true, unique: true },
    { key: 'nama', label: 'Nama Unit / Tempat Tugas', type: 'string', required: true },
    { key: 'singkatan', label: 'Singkatan', type: 'string' },
    { key: 'parent_id', label: 'Induk', type: 'ref', ref: 'UnitKerja' },
    { key: 'level', label: 'Level', type: 'number' },
    { key: 'kepala_id', label: 'Kepala Unit (ID Pegawai)', type: 'string' },
    { key: 'email', label: 'Email Unit', type: 'string' },
    { key: 'aktif', label: 'Aktif', type: 'bool', default: true },
    { key: 'created_at', label: 'Dibuat', type: 'datetime' },
    { key: 'updated_at', label: 'Diubah', type: 'datetime' }
  ],

  /* ------------------------------------------------------------------ */
  /* 4. Pegawai (biodata induk) — pengganti "Tbl Bio"                    */
  /* ------------------------------------------------------------------ */
  Pegawai: [
    { key: 'id', label: 'ID Absen', type: 'string', required: true, unique: true },
    { key: 'nik', label: 'NIK', type: 'string' },
    { key: 'nip', label: 'NIP', type: 'string' },
    { key: 'npwp', label: 'NPWP', type: 'string' },
    { key: 'karpeg', label: 'KARPEG-NAKERTRANS', type: 'string' },
    { key: 'nama', label: 'Nama', type: 'string', required: true },
    { key: 'jenis_kelamin', label: 'Jenis Kelamin', type: 'string', options: 'OPSI_JENIS_KELAMIN' },
    { key: 'agama', label: 'Agama', type: 'string', options: 'OPSI_AGAMA' },
    { key: 'email', label: 'Email', type: 'string' },
    { key: 'nomor_hp', label: 'Nomor HP', type: 'string' },
    { key: 'tempat_lahir', label: 'Tempat Lahir', type: 'string' },
    { key: 'kota_tempat_lahir', label: 'Kota Tempat Lahir', type: 'string' },
    { key: 'tanggal_lahir', label: 'Tanggal Lahir', type: 'date' },
    { key: 'link_foto', label: 'Link Foto', type: 'string' },
    { key: 'batas_usia_pensiun', label: 'Batas Usia Pensiun (th)', type: 'number' },
    { key: 'catatan', label: 'Catatan', type: 'string' },
    { key: 'created_by', label: 'Dibuat Oleh', type: 'ref', ref: 'Users' },
    { key: 'created_at', label: 'Dibuat', type: 'datetime' },
    { key: 'updated_at', label: 'Diubah', type: 'datetime' }
  ],

  /* ------------------------------------------------------------------ */
  /* 5. Riwayat status kepegawaian                                       */
  /* ------------------------------------------------------------------ */
  RiwayatStatus: [
    { key: 'id', label: 'ID', type: 'string', unique: true },
    { key: 'pegawai_id', label: 'ID Pegawai', type: 'ref', ref: 'Pegawai', required: true },
    { key: 'nama', label: 'Nama (snapshot)', type: 'string' },
    { key: 'status_pegawai', label: 'Status Pegawai', type: 'string', options: 'OPSI_STATUS_PEGAWAI' },
    { key: 'tmt_status', label: 'TMT Status Pegawai', type: 'date' },
    { key: 'jenis_pegawai', label: 'Jenis Pegawai', type: 'string', options: 'OPSI_JENIS_PEGAWAI' },
    { key: 'tmt_jenis_pegawai', label: 'TMT Jenis Pegawai', type: 'date' },
    { key: 'no_sk', label: 'Nomor SK', type: 'string' },
    { key: 'tmt_sk', label: 'TMT SK', type: 'date' },
    { key: 'keterangan', label: 'Keterangan', type: 'string' },
    { key: 'created_by', label: 'Dibuat Oleh', type: 'ref', ref: 'Users' },
    { key: 'created_at', label: 'Dibuat', type: 'datetime' }
  ],

  /* ------------------------------------------------------------------ */
  /* 6. Riwayat pendidikan                                               */
  /* ------------------------------------------------------------------ */
  RiwayatPendidikan: [
    { key: 'id', label: 'ID', type: 'string', unique: true },
    { key: 'pegawai_id', label: 'ID Pegawai', type: 'ref', ref: 'Pegawai', required: true },
    { key: 'tingkat_pend', label: 'Tingkat Pendidikan', type: 'string', options: 'OPSI_TINGKAT_PEND' },
    { key: 'nama_kampus', label: 'Nama Kampus', type: 'string' },
    { key: 'jurusan', label: 'Jurusan/Peminatan', type: 'string' },
    { key: 'tahun_masuk', label: 'Tahun Masuk', type: 'number' },
    { key: 'tahun_lulus', label: 'Tahun Lulus', type: 'number' },
    { key: 'no_ijazah', label: 'Nomor Ijazah', type: 'string' },
    { key: 'gelar_depan', label: 'Gelar Depan', type: 'string' },
    { key: 'gelar_belakang', label: 'Gelar Belakang', type: 'string' },
    { key: 'created_by', label: 'Dibuat Oleh', type: 'ref', ref: 'Users' },
    { key: 'created_at', label: 'Dibuat', type: 'datetime' }
  ],

  /* ------------------------------------------------------------------ */
  /* 7. Riwayat pangkat & golongan                                       */
  /* ------------------------------------------------------------------ */
  RiwayatPangkat: [
    { key: 'id', label: 'ID', type: 'string', unique: true },
    { key: 'pegawai_id', label: 'ID Pegawai', type: 'ref', ref: 'Pegawai', required: true },
    { key: 'gol', label: 'Golongan', type: 'string', options: 'OPSI_GOL' },
    { key: 'nama_sk', label: 'Nama SK', type: 'string' },
    { key: 'nomor_sk', label: 'Nomor SK', type: 'string' },
    { key: 'tmt', label: 'TMT Pangkat', type: 'date' },
    { key: 'gaji_pokok', label: 'Gaji Pokok', type: 'number' },
    { key: 'jabatan_permenpan', label: 'Jabatan PERMENPAN', type: 'string' },
    { key: 'kelas_jabatan', label: 'Kelas Jabatan', type: 'number' },
    { key: 'no_sk_fungsional', label: 'Nomor SK Fungsional', type: 'string' },
    { key: 'tmt_sk_fungsional', label: 'TMT SK Fungsional', type: 'date' },
    { key: 'tgl_sk_fungsional', label: 'Tanggal SK Fungsional', type: 'date' },
    { key: 'tunjangan_pak', label: 'Tunjangan PAK', type: 'number' },
    { key: 'jabatan_tpp', label: 'Jabatan TPP', type: 'string' },
    { key: 'created_by', label: 'Dibuat Oleh', type: 'ref', ref: 'Users' },
    { key: 'created_at', label: 'Dibuat', type: 'datetime' }
  ],

  /* ------------------------------------------------------------------ */
  /* 8. Riwayat jabatan & tempat tugas (T4)                              */
  /* ------------------------------------------------------------------ */
  RiwayatJabatan: [
    { key: 'id', label: 'ID', type: 'string', unique: true },
    { key: 'pegawai_id', label: 'ID Pegawai', type: 'ref', ref: 'Pegawai', required: true },
    { key: 'tempat_tugas', label: 'Tempat Tugas / Unit', type: 'string' },
    { key: 'jabatan', label: 'Jabatan', type: 'string' },
    { key: 'tmt_tempat_tugas', label: 'TMT Tempat Tugas', type: 'date' },
    { key: 'no_sk', label: 'Nomor SK', type: 'string' },
    { key: 'created_by', label: 'Dibuat Oleh', type: 'ref', ref: 'Users' },
    { key: 'created_at', label: 'Dibuat', type: 'datetime' }
  ],

  /* ------------------------------------------------------------------ */
  /* 9. Riwayat Kenaikan Gaji Berkala (KGB)                              */
  /* ------------------------------------------------------------------ */
  RiwayatKGB: [
    { key: 'id', label: 'ID', type: 'string', unique: true },
    { key: 'pegawai_id', label: 'ID Pegawai', type: 'ref', ref: 'Pegawai', required: true },
    { key: 'gol', label: 'Golongan', type: 'string', options: 'OPSI_GOL' },
    { key: 'nama_sk', label: 'Nama SK', type: 'string' },
    { key: 'nomor_sk', label: 'Nomor SK', type: 'string' },
    { key: 'tmt_kgb', label: 'TMT KGB', type: 'date' },
    { key: 'gaji_berkala', label: 'Gaji Berkala', type: 'number' },
    { key: 'created_by', label: 'Dibuat Oleh', type: 'ref', ref: 'Users' },
    { key: 'created_at', label: 'Dibuat', type: 'datetime' }
  ],

  /* ------------------------------------------------------------------ */
  /* 10. Masa kerja (1 baris per pegawai)                                */
  /* ------------------------------------------------------------------ */
  MasaKerja: [
    { key: 'id', label: 'ID', type: 'string', unique: true },
    { key: 'pegawai_id', label: 'ID Pegawai', type: 'ref', ref: 'Pegawai', required: true, unique: true },
    { key: 'tmt_rs_pertama', label: 'TMT RS Pertama', type: 'date' },
    { key: 'tmt_rs_terakhir', label: 'TMT RS Terakhir', type: 'date' },
    { key: 'keterangan', label: 'Keterangan', type: 'string' },
    { key: 'created_at', label: 'Dibuat', type: 'datetime' },
    { key: 'updated_at', label: 'Diubah', type: 'datetime' }
  ],

  /* ------------------------------------------------------------------ */
  /* 11. Dokumen (SIP / STR / KARPEG / ijazah / SK / lainnya)            */
  /* ------------------------------------------------------------------ */
  Dokumen: [
    { key: 'id', label: 'ID', type: 'string', unique: true },
    { key: 'pegawai_id', label: 'ID Pegawai', type: 'ref', ref: 'Pegawai', required: true },
    { key: 'jenis', label: 'Jenis Dokumen', type: 'string', options: 'OPSI_JENIS_DOKUMEN' },
    { key: 'nomor', label: 'Nomor', type: 'string' },
    { key: 'tmt_terbit', label: 'TMT Terbit', type: 'date' },
    { key: 'tmt_valid', label: 'TMT Valid', type: 'date' },
    { key: 'catatan', label: 'Catatan', type: 'string' },
    { key: 'file_url', label: 'Link File', type: 'string' },
    { key: 'created_by', label: 'Dibuat Oleh', type: 'ref', ref: 'Users' },
    { key: 'created_at', label: 'Dibuat', type: 'datetime' }
  ],

  /* ------------------------------------------------------------------ */
  /* 12. Log aktivitas / audit trail                                     */
  /* ------------------------------------------------------------------ */
  LogAktivitas: [    { key: 'id', label: 'ID', type: 'string', unique: true },
    { key: 'waktu', label: 'Waktu', type: 'datetime' },
    { key: 'user_id', label: 'User', type: 'ref', ref: 'Users' },
    { key: 'user_nama', label: 'Nama', type: 'string' },
    { key: 'aksi', label: 'Aksi', type: 'string' },
    { key: 'entitas', label: 'Entitas', type: 'string' },
    { key: 'entitas_id', label: 'ID Entitas', type: 'string' },
    { key: 'keterangan', label: 'Keterangan', type: 'string' },
    { key: 'data_lama', label: 'Data Sebelum', type: 'json' },
    { key: 'data_baru', label: 'Data Sesudah', type: 'json' },
    { key: 'ip', label: 'IP', type: 'string' },
    { key: 'user_agent', label: 'User Agent', type: 'string' }
  ],

  /* ------------------------------------------------------------------ */
  /* 13. Usulan kenaikan pangkat / KGB (+ alur persetujuan)              */
  /* ------------------------------------------------------------------ */
  Usulan: [
    { key: 'id', label: 'ID', type: 'string', unique: true },
    { key: 'nomor_usulan', label: 'Nomor Usulan', type: 'string', unique: true },
    { key: 'jenis', label: 'Jenis Usulan', type: 'string', required: true,
      options: 'OPSI_JENIS_USULAN' },
    { key: 'pegawai_id', label: 'ID Pegawai', type: 'ref', ref: 'Pegawai', required: true },
    { key: 'status', label: 'Status', type: 'string', required: true,
      options: 'OPSI_STATUS_USULAN' },
    { key: 'periode_tmt', label: 'Periode TMT', type: 'date' },
    { key: 'golongan_lama', label: 'Golongan Lama', type: 'string' },
    { key: 'golongan_baru', label: 'Golongan Baru', type: 'string' },
    { key: 'gaji_lama', label: 'Gaji Lama', type: 'number' },
    { key: 'gaji_baru', label: 'Gaji Baru', type: 'number' },
    { key: 'tmt_kgb_terakhir', label: 'TMT KGB Terakhir', type: 'date' },
    { key: 'catatan', label: 'Catatan', type: 'string' },
    { key: 'diajukan_oleh', label: 'Diajukan Oleh', type: 'string' },
    { key: 'diajukan_at', label: 'Diajukan Pada', type: 'datetime' },
    { key: 'diputuskan_oleh', label: 'Diputuskan Oleh', type: 'string' },
    { key: 'diputuskan_at', label: 'Diputuskan Pada', type: 'datetime' },
    { key: 'alasan_keputusan', label: 'Alasan Keputusan', type: 'string' },
    { key: 'file_sk_url', label: 'Link File SK', type: 'string' },
    { key: 'file_sk_nama', label: 'Nama File SK', type: 'string' },
    { key: 'created_by', label: 'Dibuat Oleh', type: 'ref', ref: 'Users' },
    { key: 'created_at', label: 'Dibuat', type: 'datetime' },
    { key: 'updated_at', label: 'Diubah', type: 'datetime' }
  ],

  /* 14. Jejak/riwayat tindakan pada usulan (siapa mengajukan, menyetujui) */
  UsulanRiwayat: [
    { key: 'id', label: 'ID', type: 'string', unique: true },
    { key: 'usulan_id', label: 'ID Usulan', type: 'ref', ref: 'Usulan', required: true },
    { key: 'aksi', label: 'Aksi', type: 'string', required: true },
    { key: 'user_id', label: 'User', type: 'ref', ref: 'Users' },
    { key: 'user_nama', label: 'Nama Pengguna', type: 'string' },
    { key: 'waktu', label: 'Waktu', type: 'datetime' },
    { key: 'catatan', label: 'Catatan', type: 'string' },
    { key: 'data_lama', label: 'Data Sebelum', type: 'json' },
    { key: 'data_baru', label: 'Data Sesudah', type: 'json' }
  ]
};

/** Nama sheet default pada workbook (urutan pembuatan). */
var SHEET_NAMES = Object.keys(SHEETS);
