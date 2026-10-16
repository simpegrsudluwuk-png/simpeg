const fs = require('fs');
const files = ['src/web/index.html', 'src/web/style.html', 'src/web/app.html'];
files.forEach(function (f) {
  const s = fs.readFileSync(f, 'utf8');
  ['div', 'button', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'form', 'script', 'select', 'span'].forEach(function (t) {
    const buka = (s.match(new RegExp('<' + t + '(?=[\\s>])', 'g')) || []).length;
    const tutup = (s.match(new RegExp('</' + t + '>', 'g')) || []).length;
    if (buka !== tutup) {
      console.log(f + ': <' + t + '> buka=' + buka + ' tutup=' + tutup);
    }
  });
});
console.log('cek tag selesai');

// Cek keseimbangan kurung pada JS di app.html
const app = fs.readFileSync('src/web/app.html', 'utf8');
const m = app.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.log('script tag tidak ditemukan'); process.exit(0); }
const js = m[1];
let kurung = 0, titik = 0, semicolons = 0;
let dalamStr = null, komentar = null, sebelum = null, hasil = 'aman';
for (let i = 0; i < js.length; i++) {
  const c = js[i], n = js[i + 1];
  if (komentar === '//') { if (c === '\n') komentar = null; continue; }
  if (komentar === '/*') { if (c === '*' && n === '/') { komentar = null; i++; } continue; }
  if (dalamStr) {
    if (c === '\\') { i++; continue; }
    if (c === dalamStr) dalamStr = null;
    continue;
  }
  if (c === '/' && n === '/') { komentar = '//'; i++; continue; }
  if (c === '/' && n === '*') { komentar = '/*'; i++; continue; }
  if (c === "'" || c === '"' || c === '`') { dalamStr = c; continue; }
  if (c === '{') kurung++;
  if (c === '}') kurung--;
  if (c === '(') titik++;
  if (c === ')') titik--;
  if (kurung < 0 || titik < 0) { hasil = 'RUSAK di posisi ' + i; break; }
}
console.log('JS: kurung kurawal saldo=' + kurung + ', kurung bulat saldo=' + titik + ' -> ' + hasil);
