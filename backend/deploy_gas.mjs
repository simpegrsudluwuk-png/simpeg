#!/usr/bin/env node
/**
 * deploy_gas.mjs — deploy backend Google Apps Script tanpa clasp.
 *
 * Menggunakan Apps Script API langsung dengan service account:
 *   1. Tukar JWT (RS256) -> access token (OAuth2 JWT-bearer flow).
 *   2. PUT  /v1/projects/{id}/content        -> push seluruh file src/.
 *   3. POST /v1/projects/{id}/versions       -> buat versi baru.
 *   4. PUT  /v1/projects/{id}/deployments/{deploymentId}
 *        -> arahkan deployment web-app yang SAMA ke versi baru
 *           (URL /exec tidak berubah).
 *
 * Env wajib:
 *   GOOGLE_APPLICATION_CREDENTIALS = path ke file JSON service account
 *
 * Env opsional:
 *   SCRIPT_ID     (default: dibaca dari backend/.clasp.json)
 *   DEPLOYMENT_ID (default: deployment web-app aktif)
 *
 * Dipakai lokal dan di GitHub Actions (lihat deploy-backend.yml).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(HERE, 'src');

const SCRIPT_ID =
  process.env.SCRIPT_ID ||
  JSON.parse(fs.readFileSync(path.join(HERE, '.clasp.json'), 'utf8')).scriptId;
const DEPLOYMENT_ID =
  process.env.DEPLOYMENT_ID || 'AKfycbx7Bmc_8371a6Kd1CYC4KsNVUknAgZgLWoF_BAfnN852XycaYY7ScwcIs599O2yaMUa';

const SCOPES = [
  'https://www.googleapis.com/auth/script.projects',
  'https://www.googleapis.com/auth/script.deployments',
  'https://www.googleapis.com/auth/script.webapp.deploy',
].join(' ');

const b64url = (s) => Buffer.from(s).toString('base64url');

function serviceAccountToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const jwt = [
    b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
    b64url(
      JSON.stringify({
        iss: sa.client_email,
        scope: SCOPES,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      })
    ),
  ].join('.');
  const sig = crypto.sign('RSA-SHA256', Buffer.from(jwt), sa.private_key);
  return jwt + '.' + b64url(sig);
}

async function accessToken(sa) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: serviceAccountToken(sa),
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Gagal mendapatkan access token: ${res.status} ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

function collectFiles(dir, prefix = '') {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(full, rel));
    } else if (entry.name === 'appsscript.json') {
      files.push({ name: 'appsscript', type: 'JSON', source: fs.readFileSync(full, 'utf8') });
    } else if (entry.name.endsWith('.js')) {
      files.push({ name: rel.replace(/\.js$/, ''), type: 'JAVASCRIPT', source: fs.readFileSync(full, 'utf8') });
    } else if (entry.name.endsWith('.html')) {
      files.push({ name: rel.replace(/\.html$/, ''), type: 'HTML', source: fs.readFileSync(full, 'utf8') });
    }
  }
  return files;
}

async function api(token, method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${url} -> ${res.status}\n${JSON.stringify(data, null, 2)}`);
  }
  return data;
}

async function main() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath || !fs.existsSync(keyPath)) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS harus menunjuk ke file JSON service account.');
  }
  const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  console.log(`Service account : ${sa.client_email}`);
  console.log(`Script ID       : ${SCRIPT_ID}`);
  console.log(`Deployment ID   : ${DEPLOYMENT_ID}`);

  const token = await accessToken(sa);
  const base = `https://script.googleapis.com/v1/projects/${SCRIPT_ID}`;

  // 1) Push konten
  const files = collectFiles(SRC_DIR);
  console.log(`\n[1/4] Push ${files.length} file ke Apps Script…`);
  await api(token, 'PUT', `${base}/content`, { files });
  console.log('      Konten project ter-update.');

  // 2) Buat versi baru
  console.log('\n[2/4] Membuat versi baru…');
  const desc = `Automated deploy ${new Date().toISOString()}`;
  const version = await api(token, 'POST', `${base}/versions`, { description: desc });
  console.log(`      Versi ${version.versionNumber} dibuat.`);

  // 3) Ambil konfigurasi deployment lama (pertahankan entryPoints web-app)
  console.log('\n[3/4] Membaca deployment web-app yang ada…');
  const dep = await api(token, 'GET', `${base}/deployments/${DEPLOYMENT_ID}`);
  const cfg = dep.deploymentConfig || {};
  const entryPoints = cfg.entryPoints || dep.entryPoints || [];
  if (entryPoints.length === 0) {
    throw new Error('Deployment tidak memiliki entryPoints — periksa DEPLOYMENT_ID.');
  }
  const webApp = entryPoints.find((e) => e.entryPointType === 'WEB_APP');
  console.log(`      URL lama: ${webApp?.webAppConfig?.url || '(webAppConfig tidak tersedia)'}`);

  // 4) Arahkan deployment ke versi baru
  console.log('\n[4/4] Update deployment ke versi baru…');
  const updated = await api(token, 'PUT', `${base}/deployments/${DEPLOYMENT_ID}`, {
    deploymentId: DEPLOYMENT_ID,
    deploymentConfig: {
      versionNumber: version.versionNumber,
      description: desc,
      entryPoints,
    },
  });
  const newUrl = (updated.deploymentConfig?.entryPoints || [])
    .find((e) => e.entryPointType === 'WEB_APP')
    ?.webAppConfig?.url;
  console.log('\n✅ Deploy selesai.');
  console.log(`   Versi   : ${version.versionNumber}`);
  console.log(`   URL     : ${newUrl || webApp?.webAppConfig?.url}`);
}

main().catch((err) => {
  console.error('\n❌ Deploy gagal:\n' + err.message);
  process.exit(1);
});
