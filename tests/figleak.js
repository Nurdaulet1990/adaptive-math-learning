// A question's picture must not print its answer.
//   node tests/figleak.js          (needs jsdom, like tests/items.js)
//
// Found on 2026-09-27 by drawing every AR and FR station: «2 × 4 = ?» with 8 on the last tick of the line,
// «24 ÷ 8 = ?» with 3 written in each of the eight boxes, the distributive «6 × 9 = 6 × 5 + 6 × ?» with 4 over
// the rectangle, «24 ÷ 6 = ?» with 4 beside the rows, FR-04's point labelled 2/3. A child read the answer
// instead of counting it. The figures now take `ask` / `askCol` and print «?» where the question is.
//
// This draws 40 items of every AR and FR station on levels 1 and 2 through the real generators and renderers,
// takes the text of the QUESTION figure (not the hint figure) and fails if the answer stands in it as a number
// of its own — unless the stem already says it. Allowed, on purpose:
//   · AR «helper» (AR-31): the table of multiples IS the tool; the pupil picks the digit from it
//   · AR «shift» on level 1 (AR-41): the worked shift is shown on level 1 only (owner's decision)
//   · a number line for a division (tot ÷ k): its ticks are multiples of k, and the quotient can coincide with one
//   · a remainder bar asked for the quotient: the remainder it shows can equal the quotient by chance
const fs = require('fs'), path = require('path'), vm = require('vm');
const { JSDOM } = require(process.env.JSDOM_MODULE || 'jsdom');
const ROOT = path.join(__dirname, '..');
const JS = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ROUTES = {
  FR: { files: ['fr/stages.js', 'fr/figs.js', 'fr/icons.js', 'fr/bank.js', 'fr/util.js', 'fr/generate.js', 'fr/generate2.js'] },
  AR: { files: ['ar/stages.js', 'ar/figs.js', 'ar/figs2.js', 'ar/icons.js', 'ar/bank.js', 'ar/generate.js', 'ar/generate2.js'] },
};
function boot(code) {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { runScripts: 'outside-only' });
  const w = dom.window;
  Object.defineProperty(w, 'localStorage', { configurable: true, value: { getItem: () => null, setItem() {}, removeItem() {} } });
  w.fetch = () => Promise.reject(new Error('offline'));
  const ctx = dom.getInternalVMContext();
  vm.runInContext(JS('core/core.js'), ctx, { filename: 'core/core.js' });
  vm.runInContext(JS('core/figs.js'), ctx, { filename: 'core/figs.js' });
  for (const f of ROUTES[code].files) vm.runInContext(JS(f), ctx, { filename: f });
  return { ctx,
    STAGES: vm.runInContext('STAGES', ctx),
    GEN: vm.runInContext("typeof GENERATORS!=='undefined'?GENERATORS:null", ctx),
    FIGS: vm.runInContext("typeof FIGS!=='undefined'?FIGS:null", ctx),
    draw: vm.runInContext("typeof drawItem!=='undefined'?drawItem:null", ctx),
    renderFig: vm.runInContext('renderFig', ctx) };
}

// exactly what core/runner.js does with q.fig — route drawings first, then core's own by name
function render(b, fig, fp) {
  if (!fig) return null;
  if (typeof fig === 'string') {
    if (/^\s*</.test(fig)) return { type: '(inline svg)', html: fig };
    if (b.FIGS && b.FIGS[fig]) return { type: fig, html: b.FIGS[fig]({ fp }) };
    return { type: fig, html: b.renderFig(fig, fp || '') };
  }
  if (b.FIGS && b.FIGS[fig.type]) return { type: fig.type, html: b.FIGS[fig.type](fig) };
  return { type: fig.type, html: b.renderFig(fig.type, fig.fp || '') };
}

function render(b, fig) {
  if (!fig || typeof fig !== 'object') return null;
  if (b.FIGS && b.FIGS[fig.type]) return { type: fig.type, html: b.FIGS[fig.type](fig) };
  return null;
}
const bad = []; let drawn = 0;
for (const code of Object.keys(ROUTES)) {
  const b = boot(code);
  for (const row of b.STAGES) {
    const [id, , type, params] = row; const gen = b.GEN && b.GEN[type]; if (!gen) continue;
    for (const lvl of [1, 2]) for (let k = 0; k < 40; k++) {
      let q = null; try { q = gen(params || {}, lvl); } catch (e) { break; }
      if (!q || q.ans == null) continue;
      const r = render(b, q.fig); if (!r) continue; drawn++;
      const a = String(q.ans).trim(); if (!a) continue;
      const txt = r.html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ');
      const re = new RegExp('(^|[^0-9/.,])' + a.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&') + '($|[^0-9/.,])');
      const inStem = re.test(String(q.stem || '') + ' ' + String(q.exprHTML || '').replace(/<\/b>\s*<i[^>]*>/g, '/').replace(/<[^>]*>/g, ' '));   // a fraction in the stem is <b>n</b><i>d</i>
      if (!re.test(txt) || inStem) continue;
      if (r.type === 'helper' || (r.type === 'shift' && lvl === 1) || (r.type === 'numline' && /÷/.test(q.stem))) continue;
      if (r.type === 'rembar' && /бөліндіні тап/.test(q.stem)) continue;   // asked for the quotient, the box shows the REMAINDER — equal by chance (18 ÷ 5 = 3 r 3)
      bad.push(`${id} L${lvl} ${r.type}: «${String(q.stem).slice(0, 50)}» → ${a}`);
    }
  }
}
const uniq = [...new Set(bad.map(x => x.split(':')[0]))];
uniq.forEach(u => console.log('FAIL', u, '—', bad.find(x => x.startsWith(u))));
console.log(`${drawn} question figures drawn (AR, FR · levels 1–2 · 40 per station)`);
console.log(uniq.length ? `${uniq.length} station(s) print the answer` : 'ALL PASS — no question figure prints its answer');
process.exit(uniq.length ? 1 : 0);
