/**
 * 20_SheetRepo.js
 * Data Access Layer generik di atas Google Spreadsheet.
 *
 * Setiap tabel direpresentasikan oleh sebuah worksheet sesuai
 * definisi di 01_Schema.js. Fungsi di file ini mengubah baris sheet
 * menjadi objek JavaScript (dan sebaliknya), termasuk validasi
 * required/unique, cast tipe data, dan LockService untuk operasi tulis.
 */

/** Cache metadata sheet per eksekusi. */
var _repoCache = {};

/**
 * Cache hasil pembacaan (all()) per eksekusi — satu request Google
 * sering membaca tabel yang sama berkali-kali (mis. detail pegawai
 * membaca Pegawai 2x). Cache ini membuat tabel hanya dibaca sekali,
 * sehingga request selesai dalam hitungan detik, bukan menit.
 *
 * Cache ini BERLAKU SATU EKSEKUSI GAS saja (setiap request Google
 * membuat konteks baru), sehingga tidak ada risiko data basi.
 */
var _dataCache = {};

/** Ambil (atau buat bila belum ada) sebuah worksheet. */
function getSheet(name, autoCreate) {
  var ss = getWorkbook();
  if (!ss) throw AppError('Spreadsheet database tidak dapat diakses.', 'CONFIG_MISSING');
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    if (!autoCreate) return null;
    sheet = ss.insertSheet(name);
    writeHeader(name);
  }
  return sheet;
}

/** Ambil definisi kolom sebuah tabel. */
function getColumns(name) {
  var def = SHEETS[name];
  if (!def) throw AppError('Tabel tidak dikenal: ' + name, 'UNKNOWN_TABLE');
  return def;
}

/** Tulis header + style awal ke sebuah sheet. */
function writeHeader(name) {
  var sheet = getWorkbook().getSheetByName(name);
  if (!sheet) return;
  var cols = getColumns(name);
  var labels = cols.map(function (c) { return c.label; });
  sheet.getRange(1, 1, 1, labels.length).setValues([labels])
    .setFontWeight('bold')
    .setBackground('#0f6b64')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 28);
  for (var i = 0; i < cols.length; i++) {
    sheet.setColumnWidth(i + 1, Math.min(320, Math.max(120, (cols[i].label.length * 14) + 60)));
  }
  sheet.autoResizeColumns(1, labels.length);
}

/** Peta key -> index kolom. */
function colMap(name) {
  if (!_repoCache[name]) {
    var map = {};
    getColumns(name).forEach(function (c, i) { map[c.key] = { index: i, def: c }; });
    _repoCache[name] = map;
  }
  return _repoCache[name];
}

/** Index kolom (1-based) untuk sebuah key. */
function colIndex(name, key) {
  var c = colMap(name)[key];
  if (!c) throw AppError('Kolom "' + key + '" tidak ada di tabel ' + name, 'UNKNOWN_COLUMN');
  return c.index + 1;
}

/** Nama label kolom (untuk header). */
function colLabel(name, key) {
  var c = colMap(name)[key];
  return c ? c.def.label : key;
}

/**
 * Mengubah nilai mentah dari sheet menjadi objek sesuai tipe.
 */
function castValue(def, raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  switch (def.type) {
    case 'number':
      return toNum(raw, 0);
    case 'bool':
      return toBool(raw);
    case 'date':
      // Tanggal valid -> ISO. Teks non-tanggal (mis. "Seumur Hidup")
      // dipertahankan apa adanya supaya tidak hilang informasi.
      var iso = formatDate(raw);
      if (iso) return iso;
      return String(raw);
    case 'datetime':
      var dt = formatDateTime(raw);
      return dt ? dt : String(raw);
    default:
      return String(raw);
  }
}

/** Konversi baris sheet menjadi objek. */
function rowToObj(name, values) {
  var cols = getColumns(name);
  var obj = {};
  for (var i = 0; i < cols.length; i++) {
    var key = cols[i].key;
    obj[key] = castValue(cols[i], values[i]);
    if (key === 'id') obj.id = values[i] ? String(values[i]) : values[i];
  }
  return obj;
}

/** Konversi objek menjadi baris sheet. */
function objToRow(name, obj) {
  var cols = getColumns(name);
  return cols.map(function (c) {
    var v = obj[c.key];
    if (v === undefined || v === null) return '';
    switch (c.type) {
      case 'number':
        return v === '' ? '' : toNum(v, 0);
      case 'bool':
        return toBool(v) ? true : false;
      default:
        return v;
    }
  });
}

/**
 * Kunci utama tabel: kolom 'id' bila ada, jika tidak kolom unique
 * pertama (dipakai agar baris yang sedang diperbarui tidak salah
 * dianggap duplikat).
 */
function primaryKeyOf(name) {
  var cmap = colMap(name);
  if (cmap['id']) return 'id';
  var uniques = Object.keys(cmap).filter(function (k) { return cmap[k].def.unique; });
  return uniques.length ? uniques[0] : null;
}

/** Validasi objek menurut skema. Return daftar pesan error. */
function validate(name, obj, opts) {
  opts = opts || {};
  var cols = getColumns(name);
  var errors = [];
  var cmap = colMap(name);

  cols.forEach(function (c) {
    var v = obj[c.key];
    var empty = (v === undefined || v === null || String(v).trim() === '');
    if (c.required && empty && opts.mode !== 'patch') {
      errors.push('Kolom "' + c.label + '" wajib diisi.');
      return;
    }
    if (empty) return;
    if (c.type === 'number' && isNaN(Number(v))) errors.push('Kolom "' + c.label + '" harus angka.');
    if (c.type === 'date' && !parseDate(v)) errors.push('Kolom "' + c.label + '" bukan tanggal yang valid.');
  });

  // unique constraint (dicek terhadap seluruh baris pada sheet).
  var pkKey = primaryKeyOf(name);
  var isUpdate = opts.mode === 'update';

  Object.keys(obj).forEach(function (k) {
    var cm = cmap[k];
    if (!cm || !cm.def.unique) return;
    var v = obj[k];
    if (v === undefined || v === null || String(v).trim() === '') return;
    var selfKey = (isUpdate && pkKey !== null) ? String(obj[pkKey] || '') : null;
    var others = repo(name).all().filter(function (r) {
      if (String(r[k]) !== String(v)) return false;
      // Baris yang sedang diperbarui tidak dihitung duplikat.
      if (selfKey !== null && String(r[pkKey]) === selfKey) return false;
      return true;
    });
    if (others.length) {
      errors.push('Nilai "' + v + '" pada ' + cm.def.label + ' sudah digunakan.');
    }
  });

  return errors;
}

/**
 * Factory repository untuk sebuah tabel.
 *
 * Repo API:
 *   all()                -> array objek
 *   find(predicate)      -> array objek
 *   where(criteria)      -> array objek (perbandingan ==, case-insensitive)
 *   byId(id)             -> objek | null
 *   first(criteria)      -> objek | null
 *   insert(obj)          -> objek terisi id
 *   update(id, patch)    -> objek baru
 *   remove(id)           -> boolean
 *   count(criteria)      -> number
 *   exists(criteria)     -> boolean
 *   bulkInsert(rows)     -> array objek (insert massal, lebih cepat)
 */
function repo(name) {
  return {
    name: name,
    columns: function () { return getColumns(name); },
    labels: function () { return getColumns(name).map(function (c) { return c.label; }); },

    all: function () {
      if (_dataCache[name]) return _dataCache[name].slice();
      var sheet = getSheet(name);
      if (!sheet || sheet.getLastRow() < 2) {
        _dataCache[name] = [];
        return [];
      }
      var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, getColumns(name).length).getValues();
      var out = [];
      for (var i = 0; i < values.length; i++) {
        if (String(values[i][0] || '').trim() === '') continue;
        out.push(rowToObj(name, values[i]));
      }
      _dataCache[name] = out;
      return out.slice();
    },

    find: function (pred) {
      return repo(name).all().filter(pred);
    },

    where: function (criteria) {
      criteria = criteria || {};
      var keys = Object.keys(criteria).filter(function (k) { return criteria[k] !== undefined; });
      return repo(name).all().filter(function (row) {
        return keys.every(function (k) {
          var a = row[k] === undefined ? '' : row[k];
          var b = criteria[k] === undefined ? '' : criteria[k];
          return String(a).toLowerCase() === String(b).toLowerCase();
        });
      });
    },

    byId: function (id) {
      if (!id) return null;
      var found = repo(name).where({ id: String(id) });
      return found.length ? found[0] : null;
    },

    first: function (criteria) {
      var r = repo(name).where(criteria);
      return r.length ? r[0] : null;
    },

    count: function (criteria) {
      return criteria ? repo(name).where(criteria).length : repo(name).all().length;
    },

    exists: function (criteria) {
      return repo(name).count(criteria) > 0;
    },

    insert: function (data) {
      return withLock(function () {
        var sheet = getSheet(name, true);
        var rec = clone(data || {});
        if (!String(rec.id || '').trim()) rec.id = uuid();
        if (getColumns(name).some(function (c) { return c.key === 'created_at'; }) && !rec.created_at) {
          rec.created_at = nowIso();
        }
        if (getColumns(name).some(function (c) { return c.key === 'updated_at'; }) && !rec.updated_at) {
          rec.updated_at = nowIso();
        }

        var errs = validate(name, rec, { mode: 'insert' });
        if (errs.length) throw AppError(errs.join(' '), 'VALIDATION');

        var arr = objToRow(name, rec);
        while (arr.length < getColumns(name).length) arr.push('');
        sheet.appendRow(arr);
        _repoCache = {};
        _dataCache[name] = null;
        return rec;
      });
    },

    update: function (id, patch) {
      return withLock(function () {
        var sheet = getSheet(name);
        if (!sheet) throw AppError('Tabel ' + name + ' belum dibuat.', 'NO_SHEET');
        var ncol = getColumns(name).length;
        var lastRow = sheet.getLastRow();
        if (lastRow < 2) throw AppError('Data tidak ditemukan.', 'NOT_FOUND');
        var values = sheet.getRange(2, 1, lastRow - 1, ncol).getValues();

        var rowIndex = -1;
        for (var i = 0; i < values.length; i++) {
          if (String(values[i][0]) === String(id)) { rowIndex = i + 2; break; }
        }
        if (rowIndex < 0) throw AppError('Data ' + name + ' (' + id + ') tidak ditemukan.', 'NOT_FOUND');

        var current = rowToObj(name, values[rowIndex - 2]);
        var merged = clone(current);
        Object.keys(patch || {}).forEach(function (k) { merged[k] = patch[k]; });
        merged.id = current.id;

        if (getColumns(name).some(function (c) { return c.key === 'updated_at'; })) {
          merged.updated_at = nowIso();
        }

        var errs = validate(name, merged, { mode: 'update' });
        if (errs.length) throw AppError(errs.join(' '), 'VALIDATION');

        var arr = objToRow(name, merged);
        while (arr.length < ncol) arr.push('');
        sheet.getRange(rowIndex, 1, 1, ncol).setValues([arr]);
        _repoCache = {};
        _dataCache[name] = null;
        return merged;
      });
    },

    remove: function (id) {
      return withLock(function () {
        var sheet = getSheet(name);
        if (!sheet) return false;
        var lastRow = sheet.getLastRow();
        if (lastRow < 2) return false;
        var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        for (var i = 0; i < values.length; i++) {
          if (String(values[i][0]) === String(id)) {
            sheet.deleteRow(i + 2);
            _repoCache = {};
            _dataCache[name] = null;
            return true;
          }
        }
        return false;
      });
    },

    /** Menulis banyak baris sekaligus (insert massal, lebih cepat). */
    bulkInsert: function (rows) {
      return withLock(function () {
        var sheet = getSheet(name, true);
        var result = [];
        (rows || []).forEach(function (r) {
          var rec = clone(r);
          if (!String(rec.id || '').trim()) rec.id = uuid();
          if (!rec.created_at) rec.created_at = nowIso();
          result.push(rec);
        });
        if (!result.length) return result;
        var matrix = result.map(function (r) {
          var arr = objToRow(name, r);
          while (arr.length < getColumns(name).length) arr.push('');
          return arr;
        });
        sheet.getRange(sheet.getLastRow() + 1, 1, matrix.length, getColumns(name).length)
          .setValues(matrix);
        _repoCache = {};
        _dataCache[name] = null;
        return result;
      });
    }
  };
}

/** Shortcut repository per tabel. */
function repoConfig() { return repo('Config'); }
function repoUsers() { return repo('Users'); }
function repoUnits() { return repo('UnitKerja'); }
function repoPegawai() { return repo('Pegawai'); }
function repoRiwayatStatus() { return repo('RiwayatStatus'); }
function repoRiwayatPendidikan() { return repo('RiwayatPendidikan'); }
function repoRiwayatPangkat() { return repo('RiwayatPangkat'); }
function repoRiwayatJabatan() { return repo('RiwayatJabatan'); }
function repoRiwayatKGB() { return repo('RiwayatKGB'); }
function repoMasaKerja() { return repo('MasaKerja'); }
function repoDokumen() { return repo('Dokumen'); }
function repoLog() { return repo('LogAktivitas'); }
function repoUsulan() { return repo('Usulan'); }
function repoUsulanRiwayat() { return repo('UsulanRiwayat'); }
