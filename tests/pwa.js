// The site stays installable and every page stays wired to it.
//   node tests/pwa.js          (no dependencies, no browser, no database)
//
// What breaks this in practice is not sw.js — it is a page added or re-uploaded without the <head> lines (the
// whole-page GitHub upload of teacher/index.html on 2026-09-21 would have done exactly that), a route folder
// renamed while sw.js still precaches the old one, or an icon re-exported at the wrong size. Chrome then quietly
// stops offering «Install», and nobody notices for weeks. The browser behaviour itself (install, precache, offline
// open of every route, network-first update) was checked in Chromium when sw.js was added; this file guards the wiring.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(x)); };
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const pngSize = f => { const b = fs.readFileSync(path.join(ROOT, f)); return b.toString('ascii', 1, 4) === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };

let man = null; try { man = JSON.parse(read('manifest.webmanifest')); } catch (e) { man = null; }
T('manifest.webmanifest is valid JSON', !!man);
man = man || {};
T('manifest: name, start_url, scope, display=standalone', !!(man.name && man.start_url && man.scope && man.display === 'standalone'), man);
T('manifest: start_url and scope are relative (site lives under /<repo>/ on Pages)', !/^\//.test(man.start_url || '') && !/^\//.test(man.scope || ''), [man.start_url, man.scope]);
const icons = man.icons || [];
for (const [size, purpose] of [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']]) {
  const i = icons.find(x => x.sizes === size && (x.purpose || 'any').split(' ').includes(purpose));
  const real = i && fs.existsSync(path.join(ROOT, i.src)) ? pngSize(i.src) : null;
  T(`manifest icon ${size} ${purpose} exists at that size`, !!real && real.join('x') === size, { i, real });
}
T('apple-touch-icon is 180x180', (pngSize('icons/apple-touch-icon.png') || []).join('x') === '180x180');

const pages = ['index.html', ...fs.readdirSync(ROOT, { withFileTypes: true })
  .filter(d => d.isDirectory() && fs.existsSync(path.join(ROOT, d.name, 'index.html'))).map(d => d.name + '/index.html')];
const bad = [];
for (const p of pages) {
  const h = read(p), pre = p === 'index.html' ? '' : '../';
  for (const need of [`<link rel="manifest" href="${pre}manifest.webmanifest">`, `<link rel="apple-touch-icon" href="${pre}icons/apple-touch-icon.png">`, '<meta name="theme-color"'])
    if (!h.includes(need)) bad.push({ page: p, missing: need });
  if (!/core\/core\.js\?v=\d+/.test(h)) bad.push({ page: p, missing: 'core/core.js (registers the service worker)' });
}
T(`every page (${pages.length}) links the manifest and icons and loads core.js`, bad.length === 0, bad);

const sw = read('sw.js'), core = read('core/core.js');
T('core.js registers ../sw.js', /new URL\('\.\.\/sw\.js',document\.currentScript\.src\)/.test(core));
T('sw.js leaves non-GET requests alone (every RPC is a POST)', /req\.method !== 'GET'\) return/.test(sw));
T('sw.js leaves other origins alone (Supabase, fonts)', /url\.origin !== self\.location\.origin\) return/.test(sw));
const m = /const PAGES = \[([^\]]*)\]/.exec(sw); const listed = m ? [...m[1].matchAll(/'([^']*)'/g)].map(x => x[1]) : [];
const gone = listed.filter(p => !fs.existsSync(path.join(ROOT, p, 'index.html')));
T(`sw.js precaches only pages that exist (${listed.length})`, listed.length > 0 && gone.length === 0, gone);
const routes = [...core.matchAll(/\['([A-Z]{2})','[^']*','([a-z]+\/)','live'/g)].map(x => x[2]);
const unlisted = routes.filter(r => !listed.includes(r));
T('every live route in core.js is precached', routes.length > 0 && unlisted.length === 0, unlisted);

const failed = out.filter(x => !x).length;
console.log(failed ? `${failed} FAILED of ${out.length}` : `ALL ${out.length} PASS`);
process.exit(failed ? 1 : 0);
