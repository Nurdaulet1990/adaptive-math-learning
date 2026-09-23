// Does the tester account really open every station of every route?
//   node supabase/test/e2e_tester.js        (expects a server on /tmp:54329, superuser postgres, trust auth)
//
// Nothing of ours is faked: a pupil named «tester» is registered through the real esep_login, the real
// core/core.js decides she is a tester, and then each route is BOOTED the way its own index.html boots it —
// the same files in the same order, ending in the same Runner.start(...) or initState(...) call. What the
// test then reads is the state the route itself wrote. Faked are only the browser (a small DOM) and, for PV,
// the legacy app's own functions, which pv/bridge.js wraps.
//
// Why bother, when the unlock is six lines: those six lines live in FOUR places (core/runner.js for FR/AR/TE,
// wp/state.js for WP, pv/bridge.js for PV), and a route added later will have a fifth. Nothing but a test
// that opens all of them notices when one is forgotten — and a tester account that silently stops unlocking
// one route is worse than none, because the map still looks full.
const { Client } = require(process.env.PG_MODULE || 'pg');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const SQL = f => fs.readFileSync(path.join(ROOT, 'supabase', f), 'utf8');
const JS  = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const DB  = 'esep_tst_' + Date.now();
const conn = db => new Client({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: db });
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? '  PASS' : '  FAIL', n, ok ? '' : JSON.stringify(x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const admin = conn('postgres'); await admin.connect();
  for (const d of (await admin.query(`select datname from pg_database where datname like 'esep\\_%' escape '\\'`)).rows)
    await admin.query(`drop database ${d.datname} with (force)`);
  await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`);
  await admin.query(`create database ${DB}`); await admin.end();
  const pg = conn(DB); await pg.connect();
  await pg.query(SQL('test/00_baseline_guess.sql'));
  await pg.query(`insert into students(name,pin,klass) values ('Айгүл С.','1111','3А')`);
  for (const f of ['01_additive.sql','06_stars.sql','07_practice_stars.sql','08_classes.sql','09_my_stars.sql']) await pg.query(SQL(f));

  let lock = Promise.resolve();
  const serial = fn => (lock = lock.then(fn, fn));
  const asAnon = (sql, args) => serial(async () => { await pg.query('set role anon'); try { return await pg.query(sql, args); } finally { await pg.query('reset role'); } });
  const fetchShim = async (url, opt = {}) => {
    const m = /\/rest\/v1\/rpc\/([a-z_]+)/.exec(url); if (!m) throw new Error('unexpected url ' + url);
    const args = JSON.parse(opt.body || '{}'); const keys = Object.keys(args);
    await serial(() => pg.query(`select set_config('request.headers','{}',false)`));
    const r = await asAnon(`select public.${m[1]}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as v`,
      keys.map(k => typeof args[k] === 'object' && args[k] !== null ? JSON.stringify(args[k]) : args[k]));
    const body = JSON.stringify(r.rows[0].v);
    return { ok: true, status: 200, text: async () => body, headers: { get: () => null } };
  };
  const rpc = (fn, args) => fetchShim('/rest/v1/rpc/' + fn, { body: JSON.stringify(args) }).then(r => r.text()).then(JSON.parse);

  // ── 1 · the account itself, made the way a person makes it: the login card ──────────────
  console.log('1 · registering «tester» through the real esep_login');
  // The live site has a join code, so register the way the owner will have to: with it.
  await pg.query(`select esep_private.set_join_code('Алма27')`);
  const nocode = await rpc('esep_login', { p_name: 'tester', p_pin: '9999', p_klass: '', p_code: '' });
  T('a new name without the school code is refused — the tester is made the same way a child is',
    nocode && nocode.error === 'code', nocode);
  let s = await rpc('esep_login', { p_name: 'tester', p_pin: '9999', p_klass: '', p_code: 'алма27' });
  T('a brand-new «tester» can be registered with the school code and no class', !!(s && s.token), s);
  T('an empty class is still allowed after 08 made classes a closed list', (s.student.klass || '') === '', s.student);
  const s2 = await rpc('esep_login', { p_name: 'TESTER', p_pin: '9999', p_klass: '', p_code: '' });
  T('the name is not case-sensitive on the way back in — TESTER is the same account',
    s2 && s2.token && s2.student.id === s.student.id, s2 && s2.student);

  // ── the browser ────────────────────────────────────────────────────────────────────────
  function browser(session) {
    const store = { esep_session_v1: JSON.stringify({ id: session.student.id, name: session.student.name, klass: session.student.klass || '', token: session.token }) };
    const els = {};
    const mk = id => ({ id, innerHTML: '', textContent: '', value: '', style: {}, className: '', dataset: {}, src: '',
      querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, appendChild() {}, remove() {},
      insertAdjacentHTML() {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, focus() {}, click() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }), scrollTo() {}, closest: () => null });
    const head = mk('head');
    head.appendChild = el => { if (el && el.src) { const f = String(el.src).replace(/\?.*$/, '').replace(/^\.\.\//, '');
      try { vm.runInContext(JS(f), ctx, { filename: f }); } catch (e) { console.log('    (script ' + f + ': ' + e.message + ')'); }
      setTimeout(() => el.onload && el.onload(), 0); } };
    const doc = { getElementById: id => els[id] || (els[id] = mk(id)), querySelector: () => null, querySelectorAll: () => [],
      createElement: mk, head, documentElement: mk('html'), body: mk('body'), addEventListener() {}, removeEventListener() {} };
    let ctx; ctx = { console, JSON, Math, Date, Object, Array, String, Number, Boolean, Promise, Set, Map, RegExp, Error,
      setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {}, parseInt, parseFloat, isNaN, isFinite,
      encodeURIComponent, decodeURIComponent, fetch: fetchShim, requestAnimationFrame: f => setTimeout(f, 0),
      Blob: class { constructor(p) { this.size = Buffer.byteLength(String((p && p[0]) || '')); } },
      navigator: { sendBeacon: () => true }, location: { search: '', hash: '', reload() {}, href: '' },
      localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
      URLSearchParams, document: doc, els, store, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
    ctx.window = ctx; vm.createContext(ctx);
    vm.runInContext(JS('core/core.js'), ctx, { filename: 'core/core.js' });
    return ctx;
  }

  // Boot a route exactly as its index.html does: same files, same order, same start call.
  const boot = async (files, start) => {
    const b = browser(s);
    for (const f of files) vm.runInContext(JS(f), b, { filename: f });
    await vm.runInContext(start, b, { filename: 'boot' });
    await sleep(120);
    return b;
  };
  const PLATFORM = ['core/figs.js', 'core/map.js', 'core/runner.js'];
  // A route's `const STAGES = [...]` is a top-level lexical declaration, so it is NOT a property of window —
  // in the browser either. Other scripts see it by name; we have to ask the context by name too.
  const ev = (b, expr) => vm.runInContext(expr, b);
  const report = (b, R) => { const S = ev(b, 'STAGES');
    return { tester: b.Core.tester, n: S.length, first: S[0][0],
      locked:  S.filter(([id]) => !R.stages[id] || R.stages[id].status === 'locked').map(([id]) => id),
      current: S.filter(([id]) => R.stages[id] && R.stages[id].status === 'current').map(([id]) => id),
      diag: R.diag }; };

  // ── 2 · the three routes the generic runner drives ─────────────────────────────────────
  const RUNNER_ROUTES = [
    ['FR', ['fr/stages.js', 'fr/figs.js', 'fr/icons.js', 'fr/bank.js', 'fr/generate.js'],
      `Runner.start({route:'FR',title:'Бөлшектер'})`, 7],
    ['AR', ['ar/stages.js', 'ar/figs.js', 'ar/figs2.js', 'ar/icons.js', 'ar/bank.js', 'ar/generate.js', 'ar/generate2.js'],
      `Runner.start({route:'AR',title:'Көбейту',placement:'climb'})`, 41],
    ['TE', ['te/stages.js', 'te/figs.js', 'te/icons.js', 'te/bank.js', 'te/generate.js'],
      `Runner.start({route:'TE',title:'Теңдеулер',placement:'climb'})`, 20],
  ];
  console.log('\n2 · the routes core/runner.js drives');
  for (const [code, files, start, want] of RUNNER_ROUTES) {
    const b = await boot(PLATFORM.concat(files), start);
    const R = b.Runner.state(); const r = report(b, R);
    T(`${code}: core.js recognised the tester`, r.tester === true);
    T(`${code}: all ${r.n} stations are open (${r.n === want ? 'the expected count' : 'EXPECTED ' + want})`,
      r.locked.length === 0 && r.n === want, r.locked.slice(0, 8));
    T(`${code}: exactly one station is «current», the first`, r.current.length === 1 && r.current[0] === r.first, r.current);
    T(`${code}: no placement test is asked for, and the state says why`, !!(r.diag && r.diag.tester === true), r.diag);
  }

  // ── 3 · WP, which keeps its own copy of the runner ─────────────────────────────────────
  console.log('\n3 · WP, whose state.js has its own copy of the unlock');
  {
    const b = await boot(['core/figs.js', 'core/map.js', 'wp/stages.js', 'wp/icons.js', 'wp/bank.js', 'wp/generate.js',
      'wp/state.js', 'wp/screens.js', 'wp/practice.js', 'wp/diag_test.js'],
      `(async()=>{ initState(await Core.start('WP')); showHome(); })()`);
    await sleep(200);
    const R = ev(b, 'R');
    const r = report(b, R);
    T(`WP: all ${r.n} stations are open`, r.locked.length === 0 && r.n === 13, r.locked);
    T('WP: the first station is the current one, the rest are passed', r.current.length === 1 && r.current[0] === r.first, r.current);
    T('WP: no placement test', !!(r.diag && r.diag.tester === true), r.diag);
  }

  // ── 4 · PV, which is a whole legacy app behind a bridge ────────────────────────────────
  console.log('\n4 · PV, unlocked through pv/bridge.js');
  {
    const b = browser(s);
    const LEVELS = ['c1', 'c20', 'ct10', 'c2', 'u1', 'u2', 'a1'];
    Object.assign(b, { COMP_LVL: new Set(['u1']),
      LEVEL_ORDER: LEVELS.map(id => ({ moduleId: 'm1', levelId: id })),
      // bridge.js asks pv/index.html for a station's number; the stand-in numbers its own short list
      stageNo: id => LEVELS.indexOf(id) + 1,
      MODULES: [{ id: 'm1', name: 'Санау', icon: '#', levels: LEVELS.map(id => ({ id, name: id })) }],
      state: { level: null, module: null, score: 0, questionsPerLevel: 10, completed: {}, stars: 0, unlockedUpTo: 0, started: false, placement: null },
      saveProgress() {}, generateQuestion() {}, showVisualHint() {}, showFeedback() {}, showLevelComplete() {},
      finishPlacement() {}, startDiagnostic() {}, renderMain() {}, renderSidebar() {}, selectLevel() {}, isLevelUnlocked: () => true });
    vm.runInContext(JS('pv/bridge.js'), b, { filename: 'pv/bridge.js' });
    await sleep(900);
    T('PV: every level is unlocked — PV counts a high-water mark, not a status per station',
      b.state.unlockedUpTo === LEVELS.length - 1, { unlockedUpTo: b.state.unlockedUpTo, of: LEVELS.length - 1 });
    T('PV: the placement test is skipped (started is already true)', b.state.started === true, b.state);
  }

  // ── 5 · and the tester stays out of the children's numbers ─────────────────────────────
  console.log('\n5 · what the tester must NOT do');
  {
    await pg.query(`update students set klass='3А', last_seen=now(), state=$1::jsonb where name='tester'`,
      [JSON.stringify({ AR: { stages: { 'AR-01': { status: 'passed', tests: [{ t: Date.now(), ok: 10, n: 10 }] } } } })]);
    await pg.query(`update students set last_seen=now() where name='Айгүл С.'`);
    const her = await rpc('esep_login', { p_name: 'Айгүл С.', p_pin: '1111', p_klass: '', p_code: '' });
    const board = await rpc('esep_board', { p_token: her.token });
    T('a tester in a real class is still nowhere on that class board',
      !(board.top || []).some(x => /tester/i.test(x.name)), board.top);
    T('…and is not counted in the class average either', board.n !== 2, { n: board.n });
    const list = await rpc('esep_classes', {});
    T('nor does she invent a class, or appear in the class list', Array.isArray(list) && !list.some(k => /tester/i.test(k)), list);
    const mine = await rpc('esep_stars', { p_token: s.token });
    T('her own star purse still works — a tester must be able to see what a child would see', mine && mine.n === 3, mine);
  }

  const failed = out.filter(x => !x).length;
  console.log('\n' + (failed ? `${failed} FAILED of ${out.length}` : `ALL ${out.length} PASS`));
  await pg.end();
  const g = conn('postgres'); await g.connect(); await g.query(`drop database ${DB} with (force)`); await g.end();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message, e.stack); process.exit(1); });
