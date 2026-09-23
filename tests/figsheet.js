// Build _figs.html — one page showing EVERY kind of drawing the platform can make.
//   node tests/figsheet.js          (needs jsdom: npm i jsdom, or JSDOM_MODULE=/path/to/jsdom)
//
// The samples are not invented. The script runs each route's real generators until it has seen every
// figure type they can emit, and draws each one with the parameters a real question actually carried —
// so the sheet shows what a child sees, not what the author of the sheet imagined. The stem that produced
// each drawing is printed above it, which is the only way to judge whether the picture is asking the
// question or answering it.
//
// The page loads the real core/core.css… core/ui.css, so it is the same type, the same colours and the
// same light/dark behaviour as the routes. Open it on a phone, not a desktop: that is where the drawings
// have to survive.
//
// te/figs2.js (s1 … s1d) has no generator yet, so its five drawings are listed last with parameters given
// here by hand, taken from the worked examples in the 《多步方程画法》 grammar.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { JSDOM } = require(process.env.JSDOM_MODULE || 'jsdom');
const ROOT = path.join(__dirname, '..');
const JS = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const ROUTES = {
  WP: { files: ['wp/stages.js', 'wp/icons.js', 'wp/bank.js', 'wp/generate.js', 'wp/state.js'], title: 'WP · Мәтінді есептер' },
  FR: { files: ['fr/stages.js', 'fr/figs.js', 'fr/icons.js', 'fr/bank.js', 'fr/generate.js'], title: 'FR · Бөлшектер' },
  AR: { files: ['ar/stages.js', 'ar/figs.js', 'ar/figs2.js', 'ar/icons.js', 'ar/bank.js', 'ar/generate.js', 'ar/generate2.js'], title: 'AR · Көбейту мен бөлу' },
  TE: { files: ['te/stages.js', 'te/figs.js', 'te/icons.js', 'te/bank.js', 'te/generate.js'], title: 'TE · Теңдеулер' },
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

const found = [];                 // {route, type, stage, stem, html, which}
for (const code of Object.keys(ROUTES)) {
  const b = boot(code); const seen = new Set();
  for (const row of b.STAGES) {
    const [id, , type, params] = row;
    const make = b.GEN ? (b.GEN[type] && (lvl => b.GEN[type](params || {}, lvl))) : (lvl => b.draw(id, lvl));
    if (!make) continue;
    // stop a stage as soon as it has gone quiet: a few draws with nothing new means we have its repertoire
    for (const lvl of [1, 2, 3]) { let quiet = 0;
    for (let k = 0; k < 60 && quiet < 25; k++) {
      quiet++;
      let q = null; try { q = make(lvl); } catch (e) { break; }
      if (!q) continue;
      for (const [which, fig, fp] of [['сурет', q.fig, q.fp], ['кеңес', q.hfig, q.hfp]]) {
        if (!fig) continue;
        let r = null; try { r = render(b, fig, fp); } catch (e) { r = { type: (fig.type || fig) + ' — ҚАТЕ: ' + e.message, html: '' }; }
        if (!r || seen.has(r.type)) continue;
        seen.add(r.type); quiet = 0;
        found.push({ route: code, type: r.type, stage: id, lvl, which, html: r.html, stem: String(q.stem || '').slice(0, 120) });
      }
    } }
  }
}

// the five new ones, which no question emits yet
// `const FIGS2 = …` is a lexical declaration, so it never lands on the global object — ask for it by name
const FIGS2 = vm.runInContext(JS('te/figs2.js') + ';FIGS2', vm.createContext({ console }));
const NEW = [
  ['s1',   { b: 3, a: 5, e: 8 },                       'x : 3 + 5 = 8'],
  ['s1b',  { a: 3, b: 4, c: 5 },                       '(x + 3) : 4 = 5'],
  ['s1c',  { a: 3, b: 4, e: 32 },                      '(x + 3) · 4 = 32'],
  ['s1cp', { a: 3, c: 2, e: 10 },                      '10 : (x + 3) = 2'],
  ['s1d',  { a: 3, b: 4, k: 10, e: 30 },               '(x + 3) · 4 + 10 = 30'],
];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const card = (f, note) => `<div class="fg">
  <div class="fg-h"><b>${esc(f.type)}</b><span>${esc(f.stage || '')}${f.lvl ? ' · L' + f.lvl : ''}${f.which ? ' · ' + f.which : ''}</span></div>
  <p class="stem">${esc(f.stem)}</p>
  <div class="art">${f.html}</div>${note ? `<p class="note">${note}</p>` : ''}</div>`;

let body = '';
for (const code of Object.keys(ROUTES)) {
  const list = found.filter(f => f.route === code);
  body += `<h2>${esc(ROUTES[code].title)} <small>${list.length} түр</small></h2><div class="grid">`
    + list.map(f => card(f)).join('') + '</div>';
}
body += `<h2>TE · жаңа сызбалар <small>${NEW.length} түр · te/figs2.js</small></h2>
  <p class="lead">Бұл бесеуі әлі бірде-бір сұраққа қосылған жоқ — «多步方程画法» құжатының үлгілері бойынша салынды.</p>
  <div class="grid">` + NEW.map(([k, p, stem]) => card({ type: k, stage: 'te/figs2.js', stem, html: FIGS2[k](p) })).join('') + '</div>';

const page = `<!DOCTYPE html>
<html lang="kk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Есеп жолы · барлық сызбалар</title>
<link rel="stylesheet" href="core/ui.css?v=9">
<style>
  body{padding:14px 12px 60px}
  h1{font-size:1.4rem;margin:0 0 4px} h2{font-size:1.05rem;margin:28px 0 10px;border-bottom:2px solid var(--line);padding-bottom:6px}
  h2 small{font-weight:600;color:var(--muted);font-size:.72rem;float:right;padding-top:6px}
  .lead{color:var(--muted);font-size:.88rem;margin:0 0 12px}
  .grid{display:grid;gap:12px}
  .fg{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;overflow:hidden}
  .fg-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:.8rem;margin-bottom:4px}
  .fg-h b{font-size:.95rem} .fg-h span{color:var(--muted);font-size:.72rem;text-align:right}
  .stem{font-size:.85rem;color:var(--muted);margin:0 0 10px;line-height:1.35}
  .art{background:var(--fig);border-radius:10px;padding:10px;overflow-x:auto}
  .art svg{display:block;max-width:100%;height:auto} .art img{max-width:100%}
  @media(min-width:760px){.grid{grid-template-columns:1fr 1fr}}
</style></head><body>
<h1>Барлық сызбалар</h1>
<p class="lead">Әр сурет — нақты генератор шығарған нақты сұрақтан. Үстінде сол сұрақтың мәтіні тұр: сурет сұрақты <b>сұрап</b> тұр ма, әлде <b>жауабын айтып</b> тұр ма — соны осыдан көресің.</p>
${body}
<p class="note" style="margin-top:30px">tests/figsheet.js · ${new Date().toISOString().slice(0, 10)} · ${found.length + NEW.length} сызба</p>
</body></html>`;

fs.writeFileSync(path.join(ROOT, '_figs.html'), page);
console.log(`_figs.html written — ${found.length} types from live generators + ${NEW.length} new`);
for (const code of Object.keys(ROUTES))
  console.log(`  ${code}: ${found.filter(f => f.route === code).map(f => f.type).join(', ')}`);
