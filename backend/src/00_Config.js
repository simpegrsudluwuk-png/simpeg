/**
 * 00_Config.js
 * Konfigurasi utama aplikasi SIMPEG RSUD Luwuk.
 *
 * Semua nilai dapat di-override lewat sheet "Config" (key/value),
 * sehingga administrator dapat mengubah pengaturan tanpa mengubah kode.
 */

/** ID Spreadsheet tempat seluruh data disimpan (database aplikasi). */
var DEFAULT_SPREADSHEET_ID = '15ynh0d2BIlJFFGoXhGU3Km11Hznx4ksO7XdgZudx0aw';

var CONFIG = {
  APP_NAME: 'SIMPEG',
  NAMA_APP: 'SIMPEG RSUD Luwuk',
  INSTANSI: 'RSUD Luwuk',
  UNIT_INDUK: 'Rumah Sakit Umum Daerah Luwuk',
  TEMPAT_DIBUAT: 'Luwuk',

  /**
   * Opsi dropdown untuk field kepegawaian.
   * CATATAN: kode JENIS PEGAWAI & GOL bersifat TEKS BEBAS (tidak
   * dinormalisasi sesuai keputusan). Daftar di bawah hanya saran
   * dropdown; nilai di luar daftar tetap boleh disimpan apa adanya.
   */
  OPSI_JENIS_PEGAWAI: [
    'PNS', 'PNS Titipan', 'CPNS', 'P3K', 'P3K Titipan',
    'PW', 'Honor', 'Kontrak', 'Magang', 'Lainnya'
  ],
  OPSI_STATUS_PEGAWAI: [
    'Aktif', 'Tidak Aktif', 'Pensiun', 'Berhenti',
    'Meninggal Dunia', 'Mutasi Keluar', 'Cuti Di Luar Tanggungan'
  ],
  OPSI_JENIS_KELAMIN: ['Pria', 'Wanita'],
  OPSI_AGAMA: [
    'Islam', 'Kristen Protestan', 'Kristen Katolik', 'Hindu', 'Buddha', 'Khonghucu'
  ],
  OPSI_TINGKAT_PEND: [
    'SD', 'SMP', 'SLTA Sederajat', 'SMK', 'D1', 'D2', 'D3', 'D4',
    'S1', 'Profesi', 'S2', 'S3'
  ],
  OPSI_GOL: [
    'I/a', 'I/b', 'I/c', 'I/d',
    'II/a', 'II/b', 'II/c', 'II/d',
    'III/a', 'III/b', 'III/c', 'III/d',
    'IV/a', 'IV/b', 'IV/c', 'IV/d', 'IV/e'
  ],
  OPSI_JENIS_DOKUMEN: [
    'SIP', 'STR', 'KARPEG-NAKERTRANS', 'KTP', 'IJAZAH', 'SK', 'Lainnya'
  ],

  /** Jenis usulan kepegawaian yang bisa diajukan. */
  OPSI_JENIS_USULAN: ['KP', 'KGB'],

  /** Alur status usulan: DRAFT → DIAJUKAN → DISETUJUI / DITOLAK. */
  OPSI_STATUS_USULAN: ['DRAFT', 'DIAJUKAN', 'DISETUJUI', 'DITOLAK', 'DIBATALKAN'],

  /** Ambang pengingat (hari sebelum tanggal target). */
  NOTIF_SIP_HARI: [28, 21, 14, 7],
  NOTIF_STR_HARI: [28, 21, 14, 7],
  NOTIF_KGB_HARI: [7, 6, 5],
  /** Pengingat mendekati batas usia pensiun (DHT). */
  NOTIF_DHT_HARI: [180, 90, 30],

  /**
   * Usia pensiun default per jenis pegawai (tahun).
   * Dapat dioverride lewat sheet Config (key USIA_PENSIUN_JSON)
   * atau per pegawai lewat kolom batas_usia_pensiun.
   */
  USIA_PENSIUN: { PNS: 58, P3K: 58, default: 58 },

  /** Batas usia kerja maksimum untuk perhitungan pensiun fallback. */
  RETENSI_LOG_HARI: 365,
  MAX_UPLOAD_MB: 15,
  VERSI_APLIKASI: '1.0.0'
};

/**
 * Daftar role sistem beserta deskripsi dan level (makin besar makin tinggi).
 */
var ROLES = {
  admin: {
    nama: 'Administrator Kepegawaian',
    level: 100,
    deskripsi: 'Akses penuh: master data, riwayat, konfigurasi, pengguna'
  },
  pimpinan: {
    nama: 'Pimpinan / Direksi',
    level: 80,
    deskripsi: 'Dashboard, laporan, dan persetujuan usulan kepegawaian'
  },
  operator: {
    nama: 'Operator Kepegawaian',
    level: 60,
    deskripsi: 'Input & ubah data pegawai, riwayat, dan dokumen'
  },
  pegawai: {
    nama: 'Pegawai',
    level: 20,
    deskripsi: 'Profil mandiri: lihat data sendiri (rencana fase berikutnya)'
  },
  tamu: {
    nama: 'Pengunjung',
    level: 10,
    deskripsi: 'Hanya melihat data yang dibagikan'
  }
};

/**
 * Matriks hak akses: role -> resource -> [action yang diizinkan].
 * Divalidasi di sisi server setiap request.
 */
var PERMISSIONS = {
  admin: { '*': ['*'] },

  operator: {
    pegawai: ['read', 'create', 'update', 'export'],
    riwayat_status: ['read', 'create', 'update', 'delete'],
    riwayat_pendidikan: ['read', 'create', 'update', 'delete'],
    riwayat_pangkat: ['read', 'create', 'update', 'delete'],
    riwayat_jabatan: ['read', 'create', 'update', 'delete'],
    riwayat_kgb: ['read', 'create', 'update', 'delete'],
    masa_kerja: ['read', 'create', 'update'],
    dokumen: ['read', 'create', 'update', 'delete', 'upload'],
    laporan: ['read', 'export'],
    usulan: ['read', 'create', 'update'],
    user: ['read']
  },

  pimpinan: {
    pegawai: ['read', 'export'],
    riwayat_status: ['read'],
    riwayat_pendidikan: ['read'],
    riwayat_pangkat: ['read'],
    riwayat_jabatan: ['read'],
    riwayat_kgb: ['read'],
    masa_kerja: ['read'],
    dokumen: ['read'],
    laporan: ['read', 'export'],
    usulan: ['read', 'approve', 'reject']
  },

  pegawai: {
    profil: ['read']
  },

  tamu: {
    laporan: ['read']
  }
};
