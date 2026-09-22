// The placement test, driven through the real screen.
//   node supabase/test/e2e_diag.js          (needs jsdom: npm i jsdom, or JSDOM_MODULE=/path/to/jsdom)
//
// No database and no server: the diagnostic is pure client code. What IS real here is everything of ours —
// core/core.js (offline, with a cached session), core/runner.js, and each route's own stages/generators —
// running in a real DOM. The test plays a pupil: it reads the question off the page, types the right answer
// into the real input (or clicks the right choice button), presses the real «Тексеру», and at the end reads
// the placement out of the state the runner saved.
//
// Why it exists: on 2026-09-22 a child answered every question of AR's diagnostic correctly and was placed
// on station 32 of 41. The climb probes 1 · 3 · 7 · 15 · 31 · 41 — six stations, two items each, exactly
// twelve questions — and the twelve-question cap was checked BEFORE the last pair was counted. Both answers
// were given, both were right, and both were thrown away. The only route long enough to hit the cap on the
// last probe is AR, which is why nothing else ever showed it.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { JSDOM } = require(process.env.JSDOM_MODULE || 'jsdom');
const ROOT = path.join(__dirname, '..', '..');
const JS = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? '  PASS' : '  FAIL', n, ok ? '' : JSON.stringify(x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// A browser with a real DOM and no network: Core falls back to its cache, which is what a route needs.
function browser() {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>',
    { url: 'https://example.org/ar/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  const store = { esep_session_v1: JSON.stringify({ id: '00000000-0000-0000-0000-000000000001', name: 'Диагностика', klass: '', token: 'offline' }) };
  Object.defineProperty(w, 'localStorage', { configurable: true, value: {
    getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } } });
  w.fetch = () => Promise.reject(new Error('offline'));          // Core keeps working from cache
  w.navigator.sendBeacon = () => true;
  const ctx = dom.getInternalVMContext();   // not vm.createContext(w): that unbinds window's own methods
  vm.runInContext(JS('core/core.js'), ctx, { filename: 'core/core.js' });
  return { w, ctx };
}

// Answer whatever is on screen. `right` false gives a wrong answer on purpose.
// Two screens exist: core/runner.js wires its buttons in JS (so they can be clicked), and WP's own
// wp/screens.js writes onclick="answerInput()" into the markup — which jsdom does not execute. For WP we
// therefore call exactly the function the attribute names. Either way the runner's own grading decides.
function answer(w, ctx, right) {
  const Q = w._Q; if (!Q || Q.done) return false;
  const q = Q.q, doc = w.document;
  const wrong = String(q.ans) + '7';
  const btns = [...doc.querySelectorAll('.choice')];
  if (btns.length) {
    const want = String(q.ans);
    const b = right ? (btns.find(x => x.dataset.v === want) || btns[0])
                    : (btns.find(x => x.dataset.v !== want) || btns[0]);
    if (typeof ctx.answerChoice === 'function') { ctx.answerChoice(b); ctx.answerInput(); }
    else { b.click(); doc.getElementById('ansBtn').click(); }
    return true;
  }
  if (q.kind === 'custom') {                                     // AR-31 and friends draw their own widget
    if (!w._submit) return false;
    w._submit(right ? String(q.ans) : wrong); return true;
  }
  const ai = doc.getElementById('ans');
  if (ai) { ai.value = right ? String(q.ans) : wrong;
    if (typeof ctx.answerInput === 'function') ctx.answerInput();
    else { ai.dispatchEvent(new w.Event('input')); doc.getElementById('ansBtn').click(); }
    return true; }
  return false;
}

// Play a whole diagnostic. `plan(n)` says whether question n should be answered correctly.
async function play(w, ctx, plan) {
  for (let i = 1; i <= 40; i++) {
    let tries = 0;
    while (!(w._Q && !w._Q.done) && tries++ < 40) await sleep(50);  // the runner waits 0.7–1.4 s between items
    if (!(w._Q && !w._Q.done)) break;                              // no question on screen → the test ended
    answer(w, ctx, plan(i));
    await sleep(60);
  }
  await sleep(1600);
}

const ROUTES = {
  WP: ['wp/stages.js', 'wp/icons.js', 'wp/bank.js', 'wp/generate.js', 'wp/state.js', 'wp/screens.js', 'wp/practice.js', 'wp/diag_test.js'],
  FR: ['fr/stages.js', 'fr/figs.js', 'fr/icons.js', 'fr/bank.js', 'fr/generate.js'],
  AR: ['ar/stages.js', 'ar/figs.js', 'ar/figs2.js', 'ar/icons.js', 'ar/bank.js', 'ar/generate.js', 'ar/generate2.js'],
  TE: ['te/stages.js', 'te/figs.js', 'te/icons.js', 'te/bank.js', 'te/generate.js'],
};
const START = { WP: `(async()=>{ initState(await Core.start('WP')); showHome(); })()`,
                FR: `Runner.start({route:'FR',title:'Бөлшектер'})`,
                AR: `Runner.start({route:'AR',title:'Көбейту',placement:'climb'})`,
                TE: `Runner.start({route:'TE',title:'Теңдеулер',placement:'climb'})` };

async function diagnose(code, plan) {
  const { w, ctx } = browser();
  const platform = code === 'WP' ? ['core/figs.js', 'core/map.js'] : ['core/figs.js', 'core/map.js', 'core/runner.js'];
  for (const f of platform.concat(ROUTES[code])) vm.runInContext(JS(f), ctx, { filename: f });
  /* The ONE seam in this test. A `kind:'custom'` question (AR-31 draws its own widget) hands the runner a
     mount(el, submit) and reports through that callback; a test cannot click a widget it knows nothing
     about. So each generator is wrapped to swap the widget — and only the widget — for a stub that keeps
     the callback. Everything under test is untouched: the same generators make the same questions, the
     runner grades them, and the value handed back is the real q.ans through the real answer path. */
  const G = vm.runInContext("typeof GENERATORS!=='undefined'?GENERATORS:null", ctx) || {};
  for (const k of Object.keys(G)) { const gen = G[k];
    G[k] = (p, l) => { const q = gen(p, l);
      if (q && q.kind === 'custom') { w._submit = null; q.mount = (el, submit) => { w._submit = submit; }; }
      return q; }; }
  await vm.runInContext(START[code], ctx, { filename: 'boot' });
  await sleep(200);
  // «Диагностиканы бастау». The runner wires it in JS; WP writes onclick="startDiag()" into the markup,
  // which jsdom does not execute — so call exactly what that attribute says.
  if (code === 'WP') vm.runInContext('startDiag()', ctx);
  else w.document.getElementById('b_diag').click();
  await sleep(200);
  await play(w, ctx, plan);
  const R = code === 'WP' ? vm.runInContext('R', ctx) : ctx.Runner.state();
  const S = vm.runInContext('STAGES', ctx);
  const all = S.map(s => s[0]);
  return { R, all, n: (R.diag || {}).n, placed: (R.diag || {}).placed,
    at: all.indexOf((R.diag || {}).placed) + 1, of: all.length,
    passed: all.filter(id => R.stages[id].status === 'passed').length,
    results: (R.diag || {}).results };
}

(async () => {
  console.log('1 · AR, 41 stations: a pupil who gets everything right');
  {
    const d = await diagnose('AR', () => true);
    console.log(`   asked ${d.n} questions, probed ${Object.keys(d.results || {}).join(' ')}`);
    T('the climb probes six stations and ends on the last one', d.at === d.of, { placed: d.placed, at: d.at, of: d.of });
    T('…so every station below it is open', d.passed === d.of - 1, { passed: d.passed, of: d.of });
    T('…and it took no more than the twelve questions the screen promises', d.n <= 12, d.n);
    T('the last probe was actually counted, not thrown away by the cap',
      d.results && d.results[d.all[d.of - 1]] === 'pass', d.results);
  }

  console.log('\n2 · AR: a pupil who stops being right partway');
  {
    // Right through the first four probes (8 questions: stations 1, 3, 7, 15), wrong after that.
    const d = await diagnose('AR', n => n <= 8);
    T('a failure brackets the climb and places below it, never above', d.at > 1 && d.at <= 31, { at: d.at, of: d.of });
    T('the station it places on is the one the pupil starts at, the rest locked',
      d.passed === d.at - 1, { passed: d.passed, at: d.at });
  }

  console.log('\n3 · AR: a pupil who gets nothing right');
  {
    const d = await diagnose('AR', () => false);
    T('the first station is the floor — nobody is placed below it', d.at === 1, { at: d.at, placed: d.placed });
    T('…and it is short: two questions are enough to know', d.n === 2, d.n);
  }

  console.log('\n4 · the other climb route, and a route without the flag');
  {
    const te = await diagnose('TE', () => true);
    T(`TE (${te.of} stations): all right ends on the last one too`, te.at === te.of, { at: te.at, of: te.of });
    const fr = await diagnose('FR', () => true);
    T(`FR (${fr.of} stations, plain binary search): all right ends on the last one`, fr.at === fr.of, { at: fr.at, of: fr.of });
  }

  console.log('\n5 · WP, which keeps its own copy of the diagnostic (wp/diag_test.js)');
  {
    const d = await diagnose('WP', () => true);
    T(`WP (${d.of} stations): all right ends on the last one`, d.at === d.of, { at: d.at, of: d.of, n: d.n });
    const z = await diagnose('WP', () => false);
    T('WP: nothing right stays on the first', z.at === 1, { at: z.at });
  }

  const failed = out.filter(x => !x).length;
  console.log('\n' + (failed ? `${failed} FAILED of ${out.length}` : `ALL ${out.length} PASS`));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message, e.stack); process.exit(1); });
