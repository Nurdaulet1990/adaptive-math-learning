// Every page must ask for the SAME version of a shared file.
//   node tests/cachebust.js          (no dependencies, no database)
//
// A page loads `core/core.js?v=11`. The query string is the only thing that makes a device fetch the new
// file instead of the one it already holds, so a page left on an older number keeps running yesterday's
// code — and the pupils it happens to are exactly the ones who were already using the site.
//
// This has now gone wrong twice. Four releases of core/core.js went out in one day behind `?v=10`, which
// cost a day of «but I fixed that». And te/index.html sat on `core/map.js?v=5` and `core/figs.js?v=5`
// while every other route asked for v=7 — so a device that had ever opened another route ran one map.js
// on four routes and a different one on TE, with no error anywhere to say so.
//
// The rule this checks is narrow and mechanical: for a file under core/, all pages must agree. A route's
// own files are its own business — fr/stages.js and te/stages.js are different files that happen to share
// a name. It also fails a core/ reference with no ?v at all, which is the same bug with the volume up.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(x, null, 1)); };

// every file that can carry a <script src> / <link href>, including the JS that injects one
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules' || e.name === 'supabase') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    // _selfcheck.js and friends run under node and read files off disk — no browser, no cache, no ?v
    else if (/\.(html|js)$/.test(e.name) && !e.name.startsWith('_')
             && !/^(tests|core[\\/]check)/.test(path.relative(ROOT, p))) files.push(p);
  }
})(ROOT);

const refs = {};          // core/xxx.js → { version: [pages that ask for it] }
const missing = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const page = path.relative(ROOT, f).replace(/\\/g, '/');
  for (const m of src.matchAll(/["'`]([^"'`\s>]*core\/[a-z0-9_.-]+\.(?:js|css))(\?v=(\d+))?["'`]/gi)) {
    const file = 'core/' + m[1].split('core/')[1];
    if (!m[3]) { missing.push({ page, file }); continue; }
    (refs[file] = refs[file] || {})[m[3]] = ((refs[file] || {})[m[3]] || []).concat(page);
  }
}

const disagree = Object.entries(refs).filter(([, v]) => Object.keys(v).length > 1)
  .map(([file, v]) => ({ file, asked: v }));
T('every page asks for the same version of each core/ file', disagree.length === 0, disagree);
T('no page loads a core/ file without a ?v at all', missing.length === 0, missing);

const seen = Object.keys(refs).length;
T(`the check actually found something to check (${seen} core files, referenced from ${files.length} pages)`, seen >= 4);
for (const [file, v] of Object.entries(refs).sort())
  console.log(`   ${file.padEnd(16)} v=${Object.keys(v).join(',')}  ← ${Object.values(v).flat().length} page(s)`);

const failed = out.filter(x => !x).length;
console.log(failed ? `${failed} FAILED of ${out.length}` : `ALL ${out.length} PASS`);
process.exit(failed ? 1 : 0);
