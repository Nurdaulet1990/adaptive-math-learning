// Hammer every generator of every route and check the things a child would notice.
//   node tests/items.js            (needs jsdom: npm i jsdom, or JSDOM_MODULE=/path/to/jsdom)
//   node tests/items.js AR-26      (…or just one stage, printing samples)
//
// No database, no server. It loads the real core/core.js (for the real Core.isCorrect) and each route's
// real stages/generators in a real DOM, then draws N items per stage per level and checks:
//
//   1. a choice question CONTAINS its own answer            ← «没有对的»: no correct option on screen
//   2. …and contains EXACTLY ONE option the grader accepts  ← two green options is the same bug wearing a hat
//   3. the answer is never empty, and never the string «undefined» or «NaN»
//   4. a stage that has a generator actually produces items (8 tries, as the runner allows)
//
// These are the failures that cannot be argued with: whatever the pedagogy, an item whose right answer is
// not on the screen is broken, and so is one with two right answers.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { JSDOM } = require(process.env.JSDOM_MODULE || 'jsdom');
const ROOT = path.join(__dirname, '..');
const JS = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ONLY = (process.argv[2] || '').toUpperCase();
const N = +(process.env.N || 120);                     // draws per stage per level

const ROUTES = {
  WP: ['wp/stages.js', 'wp/icons.js', 'wp/bank.js', 'wp/given.js', 'wp/generate.js', 'wp/families.js', 'wp/state.js'],  // WP draws from templates, in state.js
  FR: ['fr/stages.js', 'fr/figs.js', 'fr/icons.js', 'fr/bank.js', 'fr/util.js', 'fr/generate.js', 'fr/generate2.js'],
  AR: ['ar/stages.js', 'ar/figs.js', 'ar/figs2.js', 'ar/icons.js', 'ar/bank.js', 'ar/generate.js', 'ar/generate2.js'],
  TE: ['te/stages.js', 'te/figs.js', 'te/icons.js', 'te/bank.js', 'te/generate.js'],
};

/* The list above must load what the route's own page loads, or stations whose generator lives in a file left
   out here are silently skipped — or, when a generator calls into such a file, reported as broken although the
   app is fine. That is what happened with FR from 2026-09-15: util.js and generate2.js were missing, FR-43
   «failed» for two weeks, and the 30-odd stations of generate2.js were never checked at all. */
for (const [code, files] of Object.entries(ROUTES)) {
  const page = JS(code.toLowerCase() + '/index.html');
  const need = [...page.matchAll(/<script src="(?!\.\.\/)([^"?]+)/g)].map(m => code.toLowerCase() + '/' + m[1])
    .filter(f => /\/(util|generate\d*|bank|stages)\.js$/.test(f));
  const miss = need.filter(f => !files.includes(f));
  if (miss.length) { console.log(`FAIL ${code}: the page loads ${miss.join(', ')} but this test does not — add them to ROUTES`); process.exit(1); }
}

function boot(code) {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>',
    { url: 'https://example.org/', runScripts: 'outside-only' });
  const w = dom.window;
  Object.defineProperty(w, 'localStorage', { configurable: true,
    value: { getItem: () => null, setItem() {}, removeItem() {} } });
  w.fetch = () => Promise.reject(new Error('offline'));
  const ctx = dom.getInternalVMContext();
  vm.runInContext(JS('core/core.js'), ctx, { filename: 'core/core.js' });
  vm.runInContext(JS('core/figs.js'), ctx, { filename: 'core/figs.js' });
  for (const f of ROUTES[code]) vm.runInContext(JS(f), ctx, { filename: f });
  return { w, ctx,
    STAGES: vm.runInContext('STAGES', ctx),
    GEN: vm.runInContext("typeof GENERATORS!=='undefined'?GENERATORS:null", ctx),
    draw: vm.runInContext("typeof drawItem!=='undefined'?drawItem:null", ctx) };
}

// what core/runner.js does to a raw generator result, in the two lines that matter here
const finish = (q, id, type) => { if (!q || q.stem === undefined || q.ans === undefined) return null;
  q.stage = id; q.type = type; q.kind = q.kind || (q.choices && q.choices.length ? 'choice' : 'input');
  q.choices = q.choices || []; return q; };

const bad = []; let items = 0, stages = 0, empty = [];
for (const code of Object.keys(ROUTES)) {
  const b = boot(code);
  for (const row of b.STAGES) {
    const [id, name, type, params] = row;
    if (ONLY && id !== ONLY) continue;
    const make = b.GEN ? (b.GEN[type] && ((lvl) => b.GEN[type](params || {}, lvl)))
                       : (lvl) => b.draw(id, lvl);                       // WP draws from templates by stage
    if (!make) continue;                                                 // no generator: the runner skips it too
    stages++;
    for (const lvl of [1, 2, 3]) {
      let made = 0;
      for (let k = 0; k < N; k++) {
        let q = null;
        for (let t = 0; t < 8 && !q; t++) { try { q = finish(make(lvl), id, type); } catch (e) {
          bad.push({ id, lvl, why: 'generator threw: ' + e.message }); t = 8; } }
        if (!q) continue;
        made++; items++;
        const ans = String(q.ans);
        if (!ans.trim() || /^(undefined|NaN|null)$/.test(ans)) { bad.push({ id, lvl, why: 'answer is «' + ans + '»', stem: q.stem }); continue; }
        if (q.kind !== 'choice') continue;
        const ch = q.choices.map(String);
        const accepted = ch.filter(c => b.ctx.Core.isCorrect(q, c));
        if (!ch.includes(ans))
          bad.push({ id, lvl, why: 'the answer is not among the options', ans, choices: ch, stem: q.stem });
        else if (accepted.length !== 1)
          bad.push({ id, lvl, why: accepted.length + ' options are graded correct', ans, accepted, choices: ch, stem: q.stem });
        if (ONLY && k < 3) console.log(`  ${id} L${lvl}  ${q.stem}\n        ans=${ans}  choices=[${ch.join(', ')}]`);
      }
      if (!made) empty.push(`${id} L${lvl}`);
    }
  }
}

const seen = new Set(); const uniq = bad.filter(b => { const k = b.id + b.lvl + b.why; if (seen.has(k)) return false; seen.add(k); return true; });
console.log(`\n${items} items drawn from ${stages} stages (${N} per stage per level)`);
if (empty.length) console.log(`EMPTY (a generator that never produced an item): ${empty.join(', ')}`);
if (!uniq.length && !empty.length) console.log('ALL PASS — every choice item carries its own answer, and exactly one of them');
else { console.log(`\n${uniq.length} distinct problem(s):`); for (const b of uniq) console.log(' FAIL', JSON.stringify(b)); }
process.exit(uniq.length || empty.length ? 1 : 0);
