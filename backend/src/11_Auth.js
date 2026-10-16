/**
 * 11_Auth.js
 * Autentikasi (siapa pengguna) & otorisasi (apa yang boleh dilakukan).
 *
 * Aplikasi hanya untuk pengguna internal (webapp access DOMAIN):
 * setiap pengguna wajib terdaftar di sheet "Users" dengan email
 * Google-nya, dan setiap request divalidasi hak aksesnya di server.
 */

var _sessionCache = null;

/** Email pengguna yang sedang login (Google Workspace). */
function currentEmail() {
  var email = '';
  try { email = Session.getEffectiveUser().getEmail() || ''; } catch (e) { /* ignore */ }
  if (!email) {
    try { email = Session.getActiveUser().getEmail() || ''; } catch (e2) { /* ignore */ }
  }
  return String(email).toLowerCase().trim();
}

/**
 * Mengambil data pengguna aktif berdasarkan email.
 * Mengembalikan null bila belum terdaftar atau tidak aktif.
 */
function getCurrentUser() {
  var email = currentEmail();
  if (!email) return null;
  var u = repoUsers().first({ email: email });
  if (u && toBool(u.aktif)) return u;
  return null;
}

/** Alias: data profil pengguna aktif. */
function getProfile() {
  var u = getCurrentUser();
  if (!u) {
    return { authenticated: true, registered: false, email: currentEmail() };
  }
  var role = ROLES[u.role] || ROLES.tamu;
  touchLastLogin();
  return {
    authenticated: true,
    registered: true,
    id: u.id,
    nip: u.nip,
    nama: u.nama,
    email: u.email,
    jabatan: u.jabatan,
    role: u.role,
    roleNama: role.nama,
    level: role.level,
    unit: u.unit_id ? repoUnits().byId(u.unit_id) : null,
    permissionsSnapshot: PERMISSIONS[u.role] || {},
    permissions: PERMISSIONS[u.role] || {}
  };
}

/** Memastikan pengguna terdaftar & aktif. */
function requireUser() {
  var u = getCurrentUser();
  if (!u) {
    throw AppError(
      'Akun Google Anda belum terdaftar atau tidak aktif. Hubungi Administrator Kepegawaian.',
      'UNAUTHORIZED'
    );
  }
  return u;
}

/** Cek apakah pengguna memiliki akses ke sebuah aksi. */
function can(resource, action) {
  var u = getCurrentUser();
  if (!u) return false;
  return hasPermission(u.role, resource, action);
}

/** Cek permission berdasarkan nama role. */
function hasPermission(role, resource, action) {
  var p = PERMISSIONS[role];
  if (!p) return false;
  if (p['*'] && (p['*'][0] === '*' || p['*'].indexOf(action) >= 0)) return true;
  var allowed = p[resource] || [];
  return allowed.indexOf('*') >= 0 || allowed.indexOf(action) >= 0;
}

/** Cek permission, lempar error bila tidak diizinkan. */
function authorize(resource, action) {
  var u = requireUser();
  if (!hasPermission(u.role, resource, action)) {
    throw AppError(
      'Akses ditolak: peran "' + (ROLES[u.role] ? ROLES[u.role].nama : u.role) +
      '" tidak memiliki hak untuk ' + action + ' ' + resource + '.',
      'FORBIDDEN'
    );
  }
  return u;
}

/** Daftar akses yang dimiliki pengguna untuk resource tertentu. */
function listAllowedActions(role, resource) {
  var p = PERMISSIONS[role] || {};
  var direct = p[resource] || [];
  var global = p['*'] || [];
  var out = direct.concat(global);
  return out.filter(function (v, i) { return out.indexOf(v) === i; });
}

/** Update waktu login terakhir pengguna aktif (hemat: max 1x/menit). */
function touchLastLogin() {
  try {
    var u = getCurrentUser();
    if (!u) return;
    var cache = CacheService.getScriptCache();
    var ck = 'login:' + u.id;
    if (cache.get(ck)) return;
    repoUsers().update(u.id, { terakhir_login: nowIso() });
    cache.put(ck, '1', 60);
  } catch (e) { /* abaikan */ }
}
