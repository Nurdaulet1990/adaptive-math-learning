// The drawn companions (core/pets.js) cover every animal a pupil can pick, in every mood, and are valid SVG.
//   node tests/pets.js        (no dependencies)
// A pupil who picked 🐬 years ago must still get a dolphin, not a fox: the picker's list lives in core.js
// (AVATARS) and the drawings here, so the two are checked against each other. A broken tag inside one SVG
// string takes the whole top bar with it on that pupil's device only — the one place nobody tests by hand.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(x)); };
const box = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'core/pets.js'), 'utf8'), { globalThis: box });
const P = box.Pets;
T('pets.js defines Pets', !!(P && P.svg && P.kind && P.name));
const core = fs.readFileSync(path.join(ROOT, 'core/core.js'), 'utf8');
const AV = JSON.parse(/const AVATARS=(\[[^\]]*\])/.exec(core)[1].replace(/'/g, '"'));
const kinds = AV.map(a => P.kind(a));
T(`every avatar in core.js (${AV.length}) has its own drawing`, new Set(kinds).size === AV.length && AV.every(a => P.EMOJI.includes(a)), { AV, kinds });
T('unknown avatar falls back to the fox', P.kind('🐙') === 'fox');
T('every kind has a Kazakh name', P.KINDS.every(k => /^[А-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІі ]+$/.test(P.name(k))));

// well-formed: every non-self-closing tag closed in order; no emoji left inside
function wellFormed(s) {
  const st = []; const re = /<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g; let m;
  while ((m = re.exec(s))) { const [, close, tag, , self] = m;
    if (self) continue; if (!close) st.push(tag); else if (st.pop() !== tag) return false; }
  return st.length === 0;
}
const bad = [];
for (const a of AV) for (const mood of ['idle', 'think', 'happy']) for (const head of [false, true]) {
  const s = P.svg(a, { mood, head, size: 50 });
  if (!/^<svg [^>]*width="50" height="50"/.test(s) || !wellFormed(s) || /[\u{1F300}-\u{1FAFF}]/u.test(s) || /NaN|undefined/.test(s)) bad.push({ a, mood, head });
}
T('all 8 × 3 moods × body/head are well-formed SVG of the asked size', bad.length === 0, bad.slice(0, 4));
T('moods differ (the happy face is not the idle face)', AV.every(a => P.svg(a, { mood: 'happy' }) !== P.svg(a)));

// every page that loads core.js loads pets.js before it (core draws the login picker with it)
const pages = ['index.html', ...fs.readdirSync(ROOT, { withFileTypes: true }).filter(d => d.isDirectory() && fs.existsSync(path.join(ROOT, d.name, 'index.html'))).map(d => d.name + '/index.html')];
const miss = pages.filter(p => { const h = fs.readFileSync(path.join(ROOT, p), 'utf8'); const i = h.indexOf('core/pets.js'), j = h.indexOf('core/core.js'); return j >= 0 && (i < 0 || i > j); });
T(`every page loads pets.js before core.js (${pages.length})`, miss.length === 0, miss);

const failed = out.filter(x => !x).length;
console.log(failed ? `${failed} FAILED of ${out.length}` : `ALL ${out.length} PASS`);
process.exit(failed ? 1 : 0);
