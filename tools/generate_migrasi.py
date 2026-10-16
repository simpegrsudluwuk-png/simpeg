#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_migrasi.py — Generator data migrasi SIMPEG RSUD Luwuk.

Membaca 2 sheet sumber dari aplikasi lama (hasil ekspor CSV), membersihkan
data dengan aturan yang SAMA dengan src/21_Migrasi.js, lalu menulis CSV siap
impor ke spreadsheet app baru (satu file per sheet).

Jalankan:  python tools/generate_migrasi.py
Input  :  data-sumber/*.csv  (hasil ekspor dari sheet lama)
Output :  data-migrasi/*.csv (siap diimpor ke spreadsheet 15ynh0d2BIlJFFGoXhGU3Km11Hznx4ksO7XdgZudx0aw)
"""
import csv
import io
import os
import re
import sys
from collections import Counter
from datetime import datetime, date

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(BASE, 'data-sumber')
OUT_DIR = os.path.join(BASE, 'data-migrasi')

# Bisa dioverride lewat argumen: python generate_migrasi.py <main.csv> <absen.csv>
if len(sys.argv) >= 3:
    MAIN_CSV, ABSEN_CSV = sys.argv[1], sys.argv[2]
else:
    MAIN_CSV = os.environ.get('SIMPEG_MAIN_CSV', '')
    ABSEN_CSV = os.environ.get('SIMPEG_ABSEN_CSV', '')

BULAN = {
    'januari': 1, 'februari': 2, 'maret': 3, 'april': 4, 'mei': 5, 'juni': 6,
    'juli': 7, 'agustus': 8, 'september': 9, 'oktober': 10, 'november': 11, 'desember': 12
}
LIFETIME_WORDS = ['seumur hidup', 'lifetime', 'permanent', 'selamanya']

# Nama unit yang sudah ada dari seed installDatabase (jangan diduplikasi)
SEED_UNITS = {
    'RSUD Luwuk', 'Kepala RSUD Luwuk', 'Bidang Pelayanan Medik', 'Bidang Keperawatan',
    'Bidang Penunjang Pelayanan Kesehatan', 'Bidang Administrasi', 'Subbag Kepegawaian',
    'Bagian Keuangan', 'Bagian Umum', 'Bagian Perencanaan'
}

anomali = []          # daftar (jenis, id, nama, masalah, lama, baru)
NOW = datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def catat(jenis, id_, nama, masalah, lama='', baru=''):
    anomali.append([NOW, jenis, id_, nama, masalah,
                    '' if lama is None else str(lama),
                    '' if baru is None else str(baru)])


def is_kosong(v):
    if v is None:
        return True
    s = str(v).strip()
    return s in ('', '-', '#N/A', '#ERROR!', '#REF!', '#VALUE!')


def norm_nik(v):
    if v is None:
        return ''
    s = str(v).strip()
    if not s:
        return ''
    if re.match(r'^[\d,.]+e\+?\d*$', s, re.IGNORECASE):   # rusak format ilmiah
        return ''
    return re.sub(r'[^0-9]', '', s)


def parse_tanggal(v):
    """Mengembalikan date atau None (mendukung Date, ISO, '13 Januari 1993', 13/01/1993)."""
    if v is None or v == '':
        return None
    if isinstance(v, (datetime, date)):
        return v.date() if isinstance(v, datetime) else v
    s = str(v).strip()
    if not s:
        return None
    m = re.match(r'^(\d{4})-(\d{1,2})-(\d{1,2})', s)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None
    m = re.match(r'^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$', s)
    if m and m.group(2).lower() in BULAN:
        try:
            return date(int(m.group(3)), BULAN[m.group(2).lower()], int(m.group(1)))
        except ValueError:
            return None
    m = re.match(r'^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$', s)
    if m:
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            return None
    return None


def tanggal_iso(v):
    d = parse_tanggal(v)
    return d.isoformat() if d else ''


def is_lifetime(v):
    if not v:
        return False
    s = str(v).strip().lower()
    return any(w in s for w in LIFETIME_WORDS)


def norm_email(v):
    if v is None:
        return ''
    s = str(v).strip().lower()
    if not s or s.startswith('#') or '@' not in s:
        return ''
    return re.sub(r'\s+', '', s)


def norm_hp(v):
    if v is None:
        return ''
    s = str(v).strip()
    if not s or s.startswith('#') or s == '-':
        return ''
    return re.sub(r'[^0-9]', '', s)


def angka(v):
    if is_kosong(v):
        return ''
    try:
        n = float(v)
        return int(n) if n == int(n) else n
    except (ValueError, TypeError):
        return ''


def pecah_ttl(teks, id_, nama):
    """'Talima B, 16 Februari 1992' -> ('Talima B', '1992-02-16')."""
    if is_kosong(teks):
        return '', ''
    s = str(teks).strip()
    iso, tempat = None, ''
    idx = s.rfind(',')
    if idx > -1:
        d = parse_tanggal(s[idx + 1:].strip())
        if d:
            iso, tempat = d, s[:idx].strip()
    if iso is None:
        m = re.search(r'(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*$', s)
        if m:
            iso = parse_tanggal(m.group(1))
            if iso:
                tempat = re.sub(r'[,;]\s*$', '', s[:m.start()]).strip()
    if iso is None:
        iso = parse_tanggal(s)
    if tempat and not iso:
        catat('Tanggal lahir', id_, nama, 'Tanggal lahir tidak terbaca dari TEMPAT TANGGAL LAHIR', s, tempat)
    return tempat, (iso.isoformat() if iso else '')


def baca_csv(path):
    with open(path, 'r', encoding='utf-8-sig', newline='') as f:
        rows = list(csv.reader(f))
    if not rows:
        return [], []
    header = [h.strip() for h in rows[0]]
    out = []
    for r in rows[1:]:
        obj = {}
        for i, h in enumerate(header):
            if h:
                obj[h] = r[i] if i < len(r) else ''
        if any(str(v).strip() for v in obj.values()):
            out.append(obj)
    return header, out


def tulis_csv(nama_file, header_labels, rows):
    path = os.path.join(OUT_DIR, nama_file)
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(header_labels)
        w.writerows(rows)
    return path, len(rows)


def main():
    global MAIN_CSV, ABSEN_CSV
    if not (MAIN_CSV and ABSEN_CSV):
        # cari otomatis di data-sumber/
        if os.path.isdir(SRC_DIR):
            cand = [os.path.join(SRC_DIR, f) for f in sorted(os.listdir(SRC_DIR)) if f.lower().endswith('.csv')]
            if len(cand) >= 2:
                # tentukan mana yang 44 kolom (utama) vs 14 kolom (absen)
                for c in cand:
                    hdr, _ = baca_csv(c)
                    if len(hdr) >= 40:
                        MAIN_CSV = MAIN_CSV or c
                    elif len(hdr) <= 20:
                        ABSEN_CSV = ABSEN_CSV or c
        if not (MAIN_CSV and ABSEN_CSV):
            print('ERROR: letakkan 2 CSV sumber di folder data-sumber/ '
                  '(utama 44 kolom & absen 14 kolom), atau kirim sebagai argumen.')
            sys.exit(1)

    os.makedirs(OUT_DIR, exist_ok=True)

    _, rows_main = baca_csv(MAIN_CSV)
    _, rows_absen = baca_csv(ABSEN_CSV)
    print('Sumber utama : %s baris' % len(rows_main))
    print('Sumber absen : %s baris' % len(rows_absen))

    absen_map = {str(r.get('ID ABSEN', '')).strip(): r for r in rows_absen if str(r.get('ID ABSEN', '')).strip()}

    pegawai, r_status, r_pend, r_pangkat, r_jabatan, r_kgb, m_kerja, dokumen = [], [], [], [], [], [], [], []
    unit_nama = set()
    dup_nik = {}
    n = {'RST': 0, 'RPD': 0, 'RPG': 0, 'RJB': 0, 'RKG': 0, 'MKR': 0, 'DKM': 0}

    def idgen(p):
        n[p] += 1
        return '%s-%06d' % (p, n[p])

    for r in rows_main:
        id_ = str(r.get('ID ABSEN', '')).strip()
        nama = '' if is_kosong(r.get('NAMA')) else str(r.get('NAMA')).strip()
        if not id_ or not nama:
            catat('Baris dilewati', id_, nama, 'ID Absen atau Nama kosong di sheet lama')
            continue

        # NIK
        nik_mentah = r.get('NIK')
        nik = norm_nik(nik_mentah)
        if is_kosong(nik_mentah):
            catat('NIK', id_, nama, 'NIK kosong di sheet lama')
        elif not nik:
            catat('NIK', id_, nama, 'NIK rusak format angka ilmiah — dibiarkan kosong', nik_mentah, '')
        elif len(nik) != 16:
            catat('NIK', id_, nama, 'NIK bukan 16 digit (%d)' % len(nik), nik_mentah, nik)
        if nik:
            if nik in dup_nik:
                catat('Duplikat NIK', id_, nama, 'NIK sama dengan pegawai lain — perlu ditinjau', nik, '')
            dup_nik[nik] = id_

        tempat, tgl_lahir = pecah_ttl(r.get('TEMPAT TANGGAL LAHIR'), id_, nama)

        email = norm_email(r.get('EMAIL'))
        if not is_kosong(r.get('EMAIL')) and not email:
            catat('Email', id_, nama, 'Email tidak valid — dibiarkan kosong', r.get('EMAIL'), '')
        hp = norm_hp(r.get('NOMOR HP'))
        if not is_kosong(r.get('NOMOR HP')) and not hp:
            catat('HP', id_, nama, 'Nomor HP tidak valid — dibiarkan kosong', r.get('NOMOR HP'), '')

        pegawai.append([
            id_, nik or '',
            '' if is_kosong(r.get('NIP')) else str(r.get('NIP')).strip(),
            '' if is_kosong(r.get('NPWP')) else str(r.get('NPWP')).strip(),
            '' if is_kosong(r.get('KARPEG-NAKERTRANS')) else str(r.get('KARPEG-NAKERTRANS')).strip(),
            nama,
            '' if is_kosong(r.get('JENIS KELAMIN')) else str(r.get('JENIS KELAMIN')).strip(),
            '' if is_kosong(r.get('AGAMA')) else str(r.get('AGAMA')).strip(),
            email, hp, tempat,
            '' if is_kosong(r.get('KOTA TEMPAT LAHIR')) else str(r.get('KOTA TEMPAT LAHIR')).strip(),
            tgl_lahir,
            '' if is_kosong(r.get('LINK FOTO')) else str(r.get('LINK FOTO')).strip(),
            '',
            'Dimigrasi dari app lama pada ' + NOW, '', NOW, NOW
        ])

        # --- RiwayatStatus ---
        tmt_status = tanggal_iso(r.get('TMT STATUS PEG'))
        if not is_kosong(r.get('TMT STATUS PEG')) and not tmt_status:
            catat('Tanggal TMT', id_, nama, 'TMT status pegawai tidak terbaca', r.get('TMT STATUS PEG'), '')
        r_status.append([
            idgen('RST'), id_, nama,
            '' if is_kosong(r.get('STATUS PEGAWAI')) else str(r.get('STATUS PEGAWAI')).strip(),
            tmt_status,
            '' if is_kosong(r.get('JENIS PEGAWAI')) else str(r.get('JENIS PEGAWAI')).strip(),
            '',
            '' if is_kosong(r.get('NO SURAT KEPUTUSAN STATUS')) else str(r.get('NO SURAT KEPUTUSAN STATUS')).strip(),
            tanggal_iso(r.get('TMT SK STATUS')),
            '', '', NOW
        ])

        # --- RiwayatPendidikan ---
        pend = ['', id_, '',
                '' if is_kosong(r.get('NAMA KAMPUS')) else str(r.get('NAMA KAMPUS')).strip(),
                '' if is_kosong(r.get('JURUSAN/PEMINATAN')) else str(r.get('JURUSAN/PEMINATAN')).strip(),
                '', '', '', '',
                '' if is_kosong(r.get('GELAR DEPAN')) else str(r.get('GELAR DEPAN')).strip(),
                '' if is_kosong(r.get('GELAR BELAKANG')) else str(r.get('GELAR BELAKANG')).strip(),
                '', NOW]
        pend[0] = idgen('RPD')
        pend[2] = '' if is_kosong(r.get('TINGKAT PEND')) else str(r.get('TINGKAT PEND')).strip()
        if any(pend[2:]):
            r_pend.append(pend)

        # --- RiwayatPangkat ---
        gol = '' if is_kosong(r.get('GOL')) else str(r.get('GOL')).strip()
        tmt_pangkat = tanggal_iso(r.get('TMT PANGKAT'))
        if not is_kosong(r.get('TMT PANGKAT')) and not tmt_pangkat:
            catat('Tanggal TMT', id_, nama, 'TMT pangkat tidak terbaca', r.get('TMT PANGKAT'), '')
        pangkat = [idgen('RPG'), id_, gol, '', '', tmt_pangkat, angka(r.get('GAJI POKOK')),
                   '' if is_kosong(r.get('JABATAN PERMENPAN')) else str(r.get('JABATAN PERMENPAN')).strip(),
                   angka(r.get('KELAS JABATAN')), '', '', '', '',
                   '' if is_kosong(r.get('TPP')) else str(r.get('TPP')).strip(),
                   '', NOW]
        if gol or tmt_pangkat or pangkat[6] != '' or pangkat[7]:
            r_pangkat.append(pangkat)

        # --- RiwayatJabatan ---
        tempat_tugas = '' if is_kosong(r.get('TEMPAT TUGAS')) else str(r.get('TEMPAT TUGAS')).strip()
        jab = [idgen('RJB'), id_, tempat_tugas,
               '' if is_kosong(r.get('JABATAN')) else str(r.get('JABATAN')).strip(),
               tanggal_iso(r.get('TMT TEMPAT TUGAS')), '', '', NOW]
        if tempat_tugas or jab[3] or jab[4]:
            r_jabatan.append(jab)
            if tempat_tugas:
                unit_nama.add(tempat_tugas)

        # --- RiwayatKGB ---
        tmt_kgb = tanggal_iso(r.get('TMT KGB TERAKHIR'))
        if tmt_kgb:
            r_kgb.append([idgen('RKG'), id_, gol, '', '', tmt_kgb,
                          angka(r.get('GAJI BERKALA TERAKHIR')), '', NOW])

        # --- Dokumen SIP & STR ---
        for jenis, no, tb, tv in (
            ('SIP', r.get('NOMOR SIP'), r.get('TMT TERBIT SIP'), r.get('TMT VALID SIP')),
            ('STR', r.get('NOMOR STR'), r.get('TMT TERBIT STR'), r.get('TMT VALID STR')),
        ):
            nomor = '' if is_kosong(no) else str(no).strip()
            tbit = tanggal_iso(tb)
            tval = tanggal_iso(tv) or (str(tv).strip() if is_lifetime(tv) else '')
            if not tval and not is_kosong(tv):
                catat('Dokumen ' + jenis, id_, nama, 'Masa berlaku tidak terbaca', tv, '')
            if nomor or tbit or tval:
                dokumen.append([idgen('DKM'), id_, jenis, nomor, tbit, tval,
                                'Dimigrasi dari app lama', '', '', NOW])

        # --- MasaKerja ---
        tmt_rs = tanggal_iso(r.get('TMT RS PERTAMA'))
        if tmt_rs:
            m_kerja.append([idgen('MKR'), id_, tmt_rs, '', '', NOW, NOW])
        else:
            catat('Masa kerja', id_, nama, 'TMT RS pertama tidak terbaca/kosong', r.get('TMT RS PERTAMA'), '')

        # --- pelengkap dari master absen ---
        a = absen_map.get(id_)
        if a:
            if not tempat and not is_kosong(a.get('TEMPAT LAHIR')):
                place = str(a.get('TEMPAT LAHIR')).strip()
                pegawai[-1][10] = place
                tempat = place
            if not pegawai[-1][11] and not is_kosong(a.get('KOTA TEMPAT LAHIR')):
                pegawai[-1][11] = str(a.get('KOTA TEMPAT LAHIR')).strip()
            if not pegawai[-1][12] and not is_kosong(a.get('TANGGAL LAHIR')):
                pegawai[-1][12] = tanggal_iso(a.get('TANGGAL LAHIR'))
            if not pegawai[-1][8] and not is_kosong(a.get('EMAIL')):
                pegawai[-1][8] = norm_email(a.get('EMAIL'))
            if not pegawai[-1][9] and not is_kosong(a.get('NOMOR HP')):
                pegawai[-1][9] = norm_hp(a.get('NOMOR HP'))
            if not pegawai[-1][13] and not is_kosong(a.get('LINK FOTO')):
                pegawai[-1][13] = str(a.get('LINK FOTO')).strip()

    # --- gap absen (ada di master absen, tidak ada di detail) ---
    gap = [i for i in absen_map if i not in {p[0] for p in pegawai}]
    for id_ in gap:
        a = absen_map[id_]
        nama = '' if is_kosong(a.get('NAMA')) else str(a.get('NAMA')).strip()
        if not nama:
            catat('Baris dilewati', id_, '', 'Ada di master absen tapi tanpa nama')
            continue
        catat('Gap absen', id_, nama, 'Ada di master absen tapi TIDAK ada di detail SIMPEG — riwayat belum lengkap',
              '', 'Tidak dibuat (impor terpisah bila diperlukan)')

    # --- UnitKerja baru (tempat tugas unik, tanpa yang sudah di-seed) ---
    unit_rows = []
    i = 0
    for nama_unit in sorted(unit_nama):
        if nama_unit in SEED_UNITS:
            continue
        i += 1
        unit_rows.append([
            'UK-%03d' % i, 'U%03d' % i, nama_unit,
            nama_unit[:20], '', 3, '', '', 'TRUE', NOW, NOW
        ])

    # --- tulis semua CSV ---
    hasil = []
    hasil.append(tulis_csv('01_Pegawai.csv', [
        'ID Absen', 'NIK', 'NIP', 'NPWP', 'KARPEG-NAKERTRANS', 'Nama', 'Jenis Kelamin',
        'Agama', 'Email', 'Nomor HP', 'Tempat Lahir', 'Kota Tempat Lahir', 'Tanggal Lahir',
        'Link Foto', 'Batas Usia Pensiun (th)', 'Catatan', 'Dibuat Oleh', 'Dibuat', 'Diubah'], pegawai))
    hasil.append(tulis_csv('02_RiwayatStatus.csv', [
        'ID', 'ID Pegawai', 'Nama (snapshot)', 'Status Pegawai', 'TMT Status Pegawai',
        'Jenis Pegawai', 'TMT Jenis Pegawai', 'Nomor SK', 'TMT SK', 'Keterangan',
        'Dibuat Oleh', 'Dibuat'], r_status))
    hasil.append(tulis_csv('03_RiwayatPendidikan.csv', [
        'ID', 'ID Pegawai', 'Tingkat Pendidikan', 'Nama Kampus', 'Jurusan/Peminatan',
        'Tahun Masuk', 'Tahun Lulus', 'Nomor Ijazah', 'Gelar Depan', 'Gelar Belakang',
        'Dibuat Oleh', 'Dibuat'], r_pend))
    hasil.append(tulis_csv('04_RiwayatPangkat.csv', [
        'ID', 'ID Pegawai', 'Golongan', 'Nama SK', 'Nomor SK', 'TMT Pangkat', 'Gaji Pokok',
        'Jabatan PERMENPAN', 'Kelas Jabatan', 'Nomor SK Fungsional', 'TMT SK Fungsional',
        'Tanggal SK Fungsional', 'Tunjangan PAK', 'Jabatan TPP', 'Dibuat Oleh', 'Dibuat'], r_pangkat))
    hasil.append(tulis_csv('05_RiwayatJabatan.csv', [
        'ID', 'ID Pegawai', 'Tempat Tugas / Unit', 'Jabatan', 'TMT Tempat Tugas',
        'Nomor SK', 'Dibuat Oleh', 'Dibuat'], r_jabatan))
    hasil.append(tulis_csv('06_RiwayatKGB.csv', [
        'ID', 'ID Pegawai', 'Golongan', 'Nama SK', 'Nomor SK', 'TMT KGB', 'Gaji Berkala',
        'Dibuat Oleh', 'Dibuat'], r_kgb))
    hasil.append(tulis_csv('07_MasaKerja.csv', [
        'ID', 'ID Pegawai', 'TMT RS Pertama', 'TMT RS Terakhir', 'Keterangan',
        'Dibuat', 'Diubah'], m_kerja))
    hasil.append(tulis_csv('08_Dokumen.csv', [
        'ID', 'ID Pegawai', 'Jenis Dokumen', 'Nomor', 'TMT Terbit', 'TMT Valid',
        'Catatan', 'Link File', 'Dibuat Oleh', 'Dibuat'], dokumen))
    hasil.append(tulis_csv('09_UnitKerja_baru.csv', [
        'ID', 'Kode', 'Nama Unit / Tempat Tugas', 'Singkatan', 'Induk', 'Level',
        'Kepala Unit (ID Pegawai)', 'Email Unit', 'Aktif', 'Dibuat', 'Diubah'], unit_rows))

    # Versi tanpa header untuk ditempel di bawah baris seed UnitKerja yang sudah ada
    path_noheader = os.path.join(OUT_DIR, '09b_UnitKerja_tempel.csv')
    with open(path_noheader, 'w', encoding='utf-8-sig', newline='') as f:
        csv.writer(f).writerows(unit_rows)

    # --- laporan anomali (format sama dengan sheet "Laporan Migrasi") ---
    ringkasan = {
        'pegawai': len(pegawai), 'riwayatStatus': len(r_status), 'riwayatPendidikan': len(r_pend),
        'riwayatPangkat': len(r_pangkat), 'riwayatJabatan': len(r_jabatan), 'riwayatKgb': len(r_kgb),
        'masaKerja': len(m_kerja), 'dokumen': len(dokumen), 'unitBaru': len(unit_rows),
        'gapAbsen': len(gap), 'anomali': len(anomali)
    }
    laporan_rows = [['=== RINGKASAN ===', str(ringkasan), '', '', '', '', '']]
    per_jenis = Counter(a[1] for a in anomali)
    laporan_rows.append(['--- Anomali per jenis ---', '', '', '', '', '', ''])
    for j, c in per_jenis.most_common():
        laporan_rows.append([j, '%d kasus' % c, '', '', '', '', ''])
    laporan_rows.append(['--- Detail anomali ---', '', '', '', '', '', ''])
    laporan_rows.extend(anomali)
    hasil.append(tulis_csv('10_Laporan_Migrasi.csv', [
        'WAKTU', 'JENIS', 'ID ABSEN', 'NAMA', 'MASALAH', 'NILAI LAMA', 'NILAI BARU'], laporan_rows))

    print()
    print('=== HASIL ===')
    print(ringkasan)
    print()
    per_jenis = Counter(a[1] for a in anomali)
    print('Anomali per jenis:', dict(per_jenis))
    print()
    for path, cnt in hasil:
        print('  %-28s %5d baris data' % (os.path.basename(path), cnt))
    print()
    print('CSV siap impor ada di: %s' % OUT_DIR)


if __name__ == '__main__':
    main()
