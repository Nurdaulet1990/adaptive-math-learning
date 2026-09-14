/* Hand-off self-check for the AR route (ROUTE_CONVENTION §14 + what core/runner.js
   actually requires). Not part of the route — do not ship. Run: node _selfcheck.js */
const fs = require('fs'), vm = require('vm'), path = __dirname;
const ctx = vm.createContext({ console, Math, Date, Object, String, Number, Array, JSON, parseInt, parseFloat, isNaN });
vm.runInContext('var window = globalThis;', ctx);
for (const f of ['figs.js', 'figs2.js', 'generate.js', 'generate2.js', 'stages.js', 'bank.js', 'icons.js'])
  vm.runInContext(fs.readFileSync(path + '/' + f, 'utf8'), ctx, { filename: f });
// bank.js / icons.js declare bare top-level `const`s, exactly like fr/ does. In a
// browser those live in the shared global lexical scope and core/runner.js sees
// them via `typeof CARDS`; here we hoist them onto the context the same way.
vm.runInContext('globalThis.CARDS=typeof CARDS!=="undefined"?CARDS:undefined;' +
  'globalThis.ICONS=typeof ICONS!=="undefined"?ICONS:undefined;', ctx);
const { FIGS, GENERATORS, STAGES, CARDS, ICONS } = ctx;

let fail = 0, n = 0; const msgs = new Map();
const bad = m => { fail++; msgs.set(m, (msgs.get(m) || 0) + 1); };
const KINDS = ['choice', 'input', 'custom'];        // the three core/runner.js renders

/* Core.isCorrect, copied VERBATIM from the current core/core.js so answers are
   graded here exactly as the platform grades them. Re-copy it whenever core
   changes: ROUTE_CONVENTION v1.1 §14.4 records that this copy went stale once —
   it still had the old parseFloat fallback after the multi-number patch landed,
   which made the check LAXER than production, the one direction that lets a
   defect through. */
const norm = s => String(s ?? '').trim().replace(/\s+/g, ' ').replace(',', '.').replace(/\s*%$/, '').toLowerCase();
function fracVal(s) {
  let m = String(s).match(/^(-?)(\d+)\s+(\d+)\/(\d+)$/); if (m) { const w = +m[2], nn = +m[3], d = +m[4]; return d ? (m[1] === '-' ? -1 : 1) * (w + nn / d) : NaN; }
  m = String(s).match(/^(-?)(\d+)\/(\d+)$/); if (m) { const nn = +m[2], d = +m[3]; return d ? (m[1] === '-' ? -1 : 1) * nn / d : NaN; } return NaN;
}
function isCorrect(q, given) {
  const a = norm(given), b = norm(q && q.ans); if (!a || !b) return false; if (a === b) return true;
  const fa = fracVal(a), fb = fracVal(b); if (Number.isFinite(fa) && Number.isFinite(fb)) return Math.abs(fa - fb) < 1e-9;
  if (/^-?\d+(\.\d+)?$/.test(b)) { const m = a.match(/-?\d+(\.\d+)?/); if (m) return Math.abs(parseFloat(m[0]) - parseFloat(b)) < 1e-9; }
  // Every number in the expected answer must match, in order. A bare parseFloat
  // compared only the LEADING number, so '3 қ. 5' was accepted for '3 қ. 1'
  // and '4 × 9' for '4 × 6' — and runner.js marks EVERY choice isCorrect
  // accepts, so several options could light up green at once.
  const na = a.match(/-?\d+(\.\d+)?/g) || [], nb = b.match(/-?\d+(\.\d+)?/g) || [];
  return nb.length > 0 && na.length === nb.length && na.every((v, i) => Math.abs(parseFloat(v) - parseFloat(nb[i])) < 1e-9);
}

/* ── 1. table integrity ── */
const seen = new Set();
for (const [id, name, type, params, prereq] of STAGES) {
  if (!/^AR-\d{2}$/.test(id)) bad(`id malformed: ${id}`);
  if (seen.has(id)) bad(`duplicate id: ${id}`); seen.add(id);
  if (!GENERATORS[type]) bad(`${id}: no GENERATORS['${type}']`);
  if (!CARDS[id]) bad(`${id}: no teaching card`);
  if (!ICONS[id]) bad(`${id}: no map icon`);
  for (const p of prereq) if (p.startsWith('AR-') && !STAGES.some(s => s[0] === p)) bad(`${id}: prereq ${p} missing`);
}

/* ── 2. CARDS must match what core/runner.js showCard() consumes ── */
for (const [id, cards] of Object.entries(CARDS)) {
  if (!Array.isArray(cards)) { bad(`CARDS['${id}'] must be an ARRAY of {stem,expl,fig}`); continue; }
  for (const c of cards) {
    if (!c.stem || !c.expl) bad(`CARDS['${id}']: card needs stem and expl`);
    // showCard() escapes & and < (core.js esc), so those would print literally.
    // A bare '>' is fine as text — needed for cards that compare numbers (4.7 > 4.68).
    if (/[<&]/.test(c.stem + c.expl)) bad(`CARDS['${id}']: '<' or '&' in card text (esc'd by runner)`);
    if (c.fig) {
      if (!FIGS[c.fig.type]) bad(`CARDS['${id}']: no FIGS['${c.fig.type}']`);
      else { const s = FIGS[c.fig.type](c.fig); if (/NaN|undefined/.test(s)) bad(`CARDS['${id}'] fig ${c.fig.type}: NaN`); }
    }
  }
}

/* ── 3. exercise every generator at every CPA level ── */
const evalStem = s => {
  let m = s.match(/^(\d+) × (\d+) = \?$/); if (m) return +m[1] * +m[2];
  m = s.match(/^([\d.]+) ÷ ([\d.]+) = \?$/); if (m) return +m[1] / +m[2];
  m = s.match(/^([\d +]+) = \?$/); if (m) return m[1].split('+').reduce((a, b) => a + +b, 0);
  m = s.match(/^(\d+) × \? = (\d+)$/); if (m) return +m[2] / +m[1];
  return null;
};
for (const [id, name, type, params] of STAGES) {
  for (const lvl of [1, 2, 3]) {
    for (let i = 0; i < 400; i++) {
      n++;
      let q; try { q = GENERATORS[type](params, lvl); } catch (e) { bad(`${id} L${lvl}: threw ${e.message}`); break; }
      if (!q || typeof q.stem !== 'string' || !q.stem) bad(`${id} L${lvl}: bad stem`);
      if (KINDS.indexOf(q.kind) < 0) bad(`${id} L${lvl}: kind '${q.kind}' not rendered by runner`);
      if (typeof q.ans !== 'string' || !q.ans) bad(`${id} L${lvl}: bad ans`);
      if (!q.expl || !q.h1) bad(`${id} L${lvl}: missing h1/expl`);
      if (q.kind === 'choice') {
        if (!q.choices || q.choices.indexOf(q.ans) < 0) bad(`${id} L${lvl}: ans not among choices`);
        if (new Set(q.choices).size !== q.choices.length) bad(`${id} L${lvl}: duplicate choices`);
        // 2 is legitimate only for the AR-05 partitive/quotative discrimination item
        const okN = (type === 'share') ? [2, 3, 4] : [3, 4];
        if (!okN.includes(q.choices.length)) bad(`${id} L${lvl}: ${q.choices.length} choices`);
        // runner marks EVERY choice isCorrect() says is right — a second one would light up green
        const rights = q.choices.filter(c => isCorrect(q, c));
        if (rights.length !== 1) bad(`${id} L${lvl}: ${rights.length} choices grade as correct`);
      }
      if (q.kind === 'custom' && typeof q.mount !== 'function') bad(`${id} L${lvl}: custom without mount`);
      if (q.kind === 'input' && q.mount) bad(`${id} L${lvl}: mount on non-custom kind`);
      // the answer must grade correct against itself under the REAL comparer
      if (!isCorrect(q, q.ans)) bad(`${id} L${lvl}: ans does not grade itself correct`);
      const truth = evalStem(q.stem);
      if (truth !== null && Math.abs(truth - parseFloat(q.ans)) > 1e-9) bad(`${id} L${lvl}: "${q.stem}" ans=${q.ans} expected ${truth}`);
      // guided steps are checked with isCorrect({ans:step.val}, typed) — must be scalar-safe
      for (const st of (q.steps || [])) if (st.val !== '—' && !isCorrect({ ans: st.val }, st.val)) bad(`${id} L${lvl}: step val '${st.val}' ungradeable`);
      for (const key of ['fig', 'hfig']) {
        const f = q[key]; if (!f) continue;
        if (!FIGS[f.type]) { bad(`${id} L${lvl}: no FIGS['${f.type}']`); continue; }
        let s; try { s = FIGS[f.type](f); } catch (e) { bad(`${id} ${key} ${f.type}: ${e.message}`); continue; }
        if (/NaN|undefined/.test(s)) bad(`${id} ${key} ${f.type}: NaN/undefined in SVG`);
      }
    }
  }
}

/* ── 4. stage test: core/runner.js startTest() draws 10 items deduped by
       stem+ans and REFUSES the stage if fewer than 6 distinct ones appear ── */
for (const [id, name, type, params] of STAGES) {
  let worst = 99;
  for (let trial = 0; trial < 200; trial++) {
    const got = new Set();
    for (let i = 0; i < 10; i++) for (let k = 0; k < 8; k++) {
      const c = GENERATORS[type](params, 3); const key = c.stem + c.ans;
      if (!got.has(key)) { got.add(key); break; }
    }
    worst = Math.min(worst, got.size);
  }
  if (worst < 6) bad(`${id}: stage test can draw only ${worst} distinct items (runner needs >=6)`);
  else if (worst < 8) bad(`${id}: stage test thin — only ${worst}/10 distinct`);
}

/* ── 5. hard rules §1 + platform conventions ── */
const files = ['figs.js', 'figs2.js', 'generate.js', 'generate2.js', 'stages.js', 'bank.js', 'icons.js', 'index.html']
  .map(f => [f, fs.readFileSync(path + '/' + f, 'utf8')]);
for (const [f, src] of files) {
  for (const pat of [/\balert\s*\(/, /\bconfirm\s*\(/, /\bprompt\s*\(/, /localStorage/, /sessionStorage/, /indexedDB/, /\bfetch\s*\(/])
    if (pat.test(src) && f !== 'index.html') bad(`${f}: forbidden ${pat}`);
  // colour tokens must be ones core/ui.css actually defines
  const toks = [...src.matchAll(/var\(--([a-z0-9-]+)/g)].map(m => m[1]);
  const OK = ['ink', 'muted', 'line', 'card', 'panel', 'fig', 'accent', 'accent-d', 'accent-soft', 'accent-ink',
    'gold', 'gold-d', 'gold-soft', 'good', 'good-d', 'good-soft', 'bad', 'bad-d', 'bad-soft',
    'seg1', 'seg2', 'whole', 'stroke', 'bg', 'disp', 'font', 'rc', 'rc-d', 'ar', 'ar-d'];
  for (const t of new Set(toks)) if (!OK.includes(t)) bad(`${f}: unknown CSS token --${t}`);
}
const idx = files.find(f => f[0] === 'index.html')[1];
for (const need of ['core/core.js', 'core/figs.js', 'core/map.js', 'core/runner.js', 'class="app"', 'notranslate'])
  if (!idx.includes(need)) bad(`index.html missing ${need}`);
// the split halves depend on AR_DRAW / AR_UTIL from part 1, so order is load-bearing
for (const [first, second] of [['figs.js', 'figs2.js'], ['generate.js', 'generate2.js']]) {
  const a = idx.indexOf(`src="${first}`), b = idx.indexOf(`src="${second}`);
  if (a < 0 || b < 0) bad(`index.html does not load ${first} + ${second}`);
  else if (a > b) bad(`index.html loads ${second} before ${first}`);
}
if (idx.includes('core-stub.js')) bad('index.html loads core-stub.js (fr/ loads core.js)');

console.log(`STAGES ${STAGES.length} · generators ${new Set(STAGES.map(s => s[2])).size} · questions generated ${n}`);
for (const [m, c] of [...msgs].sort((a, b) => b[1] - a[1])) console.log(`  ✗ [${c}×] ${m}`);
console.log(fail ? `\nFAIL — ${msgs.size} distinct, ${fail} occurrences` : '\nPASS — all checks clean');
process.exit(fail ? 1 : 0);
