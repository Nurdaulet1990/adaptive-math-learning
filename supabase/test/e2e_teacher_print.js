// The teacher page names its stages and prints a class report with example questions.
// Real page (served from this repo) → Playwright intercepts every request to *.supabase.co and executes it against a
// LOCAL throwaway Postgres as the `anon` role. Nothing here ever reaches the real project.   node supabase/test/e2e_teacher_print.js
const { chromium } = require(process.env.PW_MODULE || 'playwright'); const { Client, Pool } = require(process.env.PG_MODULE || 'pg');
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..'), DIR = path.join(__dirname, '..'), DB = 'esep_test_tprint_' + Date.now();
const conn = db => new Client({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: db });
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(x)); };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
/* the names the report must print, read straight from the routes' own tables */
const stages = r => { const c = {}; c.window = c; vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(ROOT, r, 'stages.js'), 'utf8') + ';globalThis.__S = STAGES;', c); return Object.fromEntries(c.__S.map(s => [s[0], { name: s[1], type: s[2] }])); };
const AR = stages('ar'), FR = stages('fr'), WP = stages('wp');
const cur = (id, level) => ({ status: 'current', level: level || 2, streak: 1, tests: [] });
(async () => {
  const srv = http.createServer((q, s) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith(path.sep) || fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => e ? (s.writeHead(404), s.end()) : (s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }), s.end(b))); }).listen(8767);
  const admin = conn('postgres'); await admin.connect();
  for (const d of (await admin.query(`select datname from pg_database where datname like 'esep_test_tprint%'`)).rows) await admin.query(`drop database ${d.datname} with (force)`);
  await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.query(`create database ${DB}`);
  const pg = conn(DB); await pg.connect(); const file = f => pg.query(fs.readFileSync(path.join(DIR, f), 'utf8'));
  await file('test/00_baseline_guess.sql');
  const evil = `<img src=x onerror="window.__xss=1">`;
  const pupils = [
    ['Айгүл С.', '3А', { AR: { nAns: 30, nOk: 24, nHint: 3, diag: { placed: 'AR-05', t: Date.now() }, stages: { 'AR-04': { status: 'passed' }, 'AR-05': cur() } }, FR: { nAns: 8, nOk: 6, nHint: 0, diag: { placed: 'FR-03', t: Date.now() }, stages: { 'FR-03': cur(1) } } }],
    ['Дана К.', '3А', { AR: { nAns: 50, nOk: 45, nHint: 2, diag: { placed: 'AR-12', t: Date.now() }, stages: { 'AR-12': cur(3) } } }],
    ['Ерасыл Т.', '3А', { AR: { nAns: 12, nOk: 9, nHint: 1, diag: { placed: 'AR-08', t: Date.now() }, stages: { 'AR-08': cur() } }, WP: { nAns: 5, nOk: 5, nHint: 0, diag: { placed: 'WP-02', t: Date.now() }, stages: { 'WP-02': cur() } } }],
    ['Нұрлан Б.', '3А', { AR: { nAns: 6, nOk: 3, nHint: 4, diag: { placed: 'AR-02', t: Date.now() }, stages: { 'AR-02': cur() } }, PV: { nAns: 9, nOk: 7, nHint: 0, diag: { placed: 'PV-03', t: Date.now() }, stages: { 'PV-03': cur(3) } } }],
    ['Мадина Ә.', '3А', { AR: { nAns: 20, nOk: 15, nHint: 1, diag: { placed: 'AR-11', t: Date.now() }, stages: { 'AR-11': cur() } } }],   // ⚡ a speed drill: no examples
    ['Әлихан Ж.', '3А', { TE: { nAns: 4, nOk: 1, nHint: 0, diag: { placed: 'x', t: 1 }, stages: { constructor: cur(), [evil]: { status: 'locked' } } } }],   // a stage id the route does not know, chosen to hit Object.prototype
    ['Сәуле М.', '3Ә', { AR: { nAns: 40, nOk: 39, nHint: 0, diag: { placed: 'AR-13', t: Date.now() }, stages: { 'AR-13': cur(3) } } }],   // another class: not in the 3А report
  ];
  for (const [n, k, st] of pupils) await pg.query(`insert into students(name,pin,klass,state) values ($1,'1111',$2,$3::jsonb)`, [n, k, JSON.stringify(st)]);
  await file('01_additive.sql'); await file('02_lock.sql'); await pg.query(`select esep_private.set_teacher_secret('мұғалім-құпиясы-2026')`);

  const pool = new Pool({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: DB, max: 6 });
  const seen = [];
  const backend = async route => { const rq = route.request(), u = new URL(rq.url()); seen.push(rq.method() + ' ' + u.pathname);
    const m = u.pathname.match(/^\/rest\/v1\/rpc\/(esep_[a-z_]+)$/);
    const c = await pool.connect();
    try { await c.query('set role anon');
      if (!m) { await c.query(`select * from public.${u.pathname.split('/').pop().replace(/\W/g, '')} limit 1`); return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); }
      const args = JSON.parse(rq.postData() || '{}'), keys = Object.keys(args);
      const r = await c.query(`select public.${m[1]}(${keys.map((k, i) => `${k.replace(/\W/g, '')} => $${i + 1}`).join(', ')}) as v`, keys.map(k => args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.rows[0].v) }).catch(() => {});
    } catch (e) { return route.fulfill({ status: /permission denied/.test(e.message) ? 401 : 400, contentType: 'application/json', body: JSON.stringify({ message: e.message }) }).catch(() => {}); }
    finally { await c.query('reset role').catch(() => {}); c.release(); } };

  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  await ctx.route(/supabase\.co/, backend); await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const errs = []; const B = 'http://localhost:8767/';
  const tp = await ctx.newPage(); tp.on('pageerror', e => errs.push('teacher: ' + e.message)); await tp.goto(B + 'teacher/'); await tp.waitForSelector('#tpin');
  await tp.fill('#tpin', 'мұғалім-құпиясы-2026'); await tp.click('#tgo'); await tp.waitForSelector('table.t3'); await tp.waitForTimeout(500);
  const rowText = async name => (await tp.locator('table.t3 tr', { hasText: name }).first().innerText()).replace(/\s+/g, ' ');

  // 1 ─ the class table: id AND name, in «барлық бағыт» and in one route
  T('class table (all routes): a stage is shown with its name from the route\'s own table', new RegExp('AR-05 ' + AR['AR-05'].name).test(await rowText('Айгүл С.')) && new RegExp('FR-03 ' + FR['FR-03'].name).test(await rowText('Айгүл С.')), await rowText('Айгүл С.'));
  T('class table: a PV stage stays a bare id (PV has no stage table yet), nothing invented', /PV-03(?! ·)/.test(await rowText('Нұрлан Б.')) && !/PV-03 [А-Яа-яӘәҚқҢңӨөҰұҮүІіҺһ]/.test(await rowText('Нұрлан Б.')), await rowText('Нұрлан Б.'));
  T('class table: a stage id named «constructor» is shown bare — no «Object», nothing from the prototype', /constructor/.test(await rowText('Әлихан Ж.')) && !/Object|function/.test(await rowText('Әлихан Ж.')), await rowText('Әлихан Ж.'));
  await tp.selectOption('select >> nth=0', 'AR'); await tp.waitForSelector('table.t3'); await tp.waitForTimeout(400);
  T('class table (AR only): id and name', new RegExp('AR-12 ' + AR['AR-12'].name).test(await rowText('Дана К.')), await rowText('Дана К.'));

  // 2 ─ CSV: a name column next to the id
  const csv = await tp.evaluate(() => new Promise(res => { const o = URL.createObjectURL; URL.createObjectURL = b => { b.text().then(res); URL.createObjectURL = o; return o.call(URL, b); }; exportCSV(); }));
  T('CSV has a «Кезең атауы» column and the AR-12 line carries the name', /;Кезең;Кезең атауы;Деңгей;/.test(csv) && new RegExp('"AR";"AR-12";"' + AR['AR-12'].name + '"').test(csv), csv.slice(0, 400));

  // 3 ─ the printed report, class 3А, all routes: after each pupil's stage its name; examples under the pupils on the top three stages of each route
  await tp.selectOption('select >> nth=0', 'ALL'); await tp.waitForSelector('table.t3'); await tp.waitForTimeout(300);
  await tp.selectOption('select >> nth=1', '3А'); await tp.waitForSelector('table.t3'); await tp.waitForTimeout(300);
  await tp.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await tp.getByRole('link', { name: 'Басып шығару' }).click(); await tp.waitForSelector('table.prt'); await tp.waitForTimeout(300);
  const rep = async () => (await tp.locator('#app').innerText()).replace(/\s+/g, ' ');
  /* the pupil's line for a route, and the examples row right under it (if any) */
  const ln = async (name, route) => { const tr = tp.locator('table.prt tr', { hasText: name }).filter({ hasText: route }).first(); const t = (await tr.innerText()).replace(/\s+/g, ' ');
    const nx = tr.locator('xpath=following-sibling::tr[1]'); const isEx = (await nx.count()) && (await nx.getAttribute('class')) === 'pex'; return { t, n: isEx ? await nx.locator('ol li').count() : 0, ex: isEx ? (await nx.innerText()).replace(/\s+/g, ' ') : '' }; };
  T('report: after each pupil\'s stage comes its name and grade', new RegExp('AR-05 — ' + AR['AR-05'].name + ' · 2-сынып').test((await ln('Айгүл С.', 'AR')).t) && new RegExp('WP-02 — ' + WP['WP-02'].name).test((await ln('Ерасыл Т.', 'WP')).t), [await ln('Айгүл С.', 'AR'), await ln('Ерасыл Т.', 'WP')]);
  T('report: the other class is not in it', !/Сәуле М\./.test(await rep()) && !/AR-13/.test(await rep()));
  T('report: AR-12, AR-11, AR-08 are the three highest AR stages → Дана (AR-12) and Ерасыл (AR-08) get three examples with answers right under their line', (await ln('Дана К.', 'AR')).n === 3 && (await ln('Ерасыл Т.', 'AR')).n === 3 && /Мысал есептер · AR-12.*→/.test((await ln('Дана К.', 'AR')).ex), [await ln('Дана К.', 'AR'), await ln('Ерасыл Т.', 'AR')]);
  T('report: Мадина is on AR-11, a ⚡ speed drill — it says so under her line, no examples', (await ln('Мадина Ә.', 'AR')).n === 0 && /уақытқа жаттығу/.test((await ln('Мадина Ә.', 'AR')).ex), await ln('Мадина Ә.', 'AR'));
  T('report: Айгүл (AR-05) and Нұрлан (AR-02) are below the top three → name, no examples', (await ln('Айгүл С.', 'AR')).n === 0 && (await ln('Айгүл С.', 'AR')).ex === '' && (await ln('Нұрлан Б.', 'AR')).n === 0 && new RegExp(AR['AR-02'].name).test((await ln('Нұрлан Б.', 'AR')).t), [await ln('Айгүл С.', 'AR'), await ln('Нұрлан Б.', 'AR')]);
  T('report: FR-03 and WP-02 (the only stage of their route) get examples', (await ln('Айгүл С.', 'FR')).n === 3 && (await ln('Ерасыл Т.', 'WP')).n === 3, [await ln('Айгүл С.', 'FR'), await ln('Ерасыл Т.', 'WP')]);
  T('report: the PV stage and the unknown TE id are listed bare, without examples; nothing executed', /PV-03 \(атауы жоқ\)/.test((await ln('Нұрлан Б.', 'PV')).t) && (await ln('Нұрлан Б.', 'PV')).n === 0 && /constructor \(атауы жоқ\)/.test((await ln('Әлихан Ж.', 'TE')).t) && (await ln('Әлихан Ж.', 'TE')).n === 0 && (await tp.evaluate(() => window.__xss)) === undefined && (await tp.locator('img').count()) === 0, [await ln('Нұрлан Б.', 'PV'), await ln('Әлихан Ж.', 'TE')]);
  const first = (await ln('Дана К.', 'AR')).ex;
  await tp.selectOption('.noprint select', '5'); await tp.waitForSelector('table.prt'); await tp.waitForTimeout(300);
  T('report: «top 5» reaches Айгүл (AR-05) and Нұрлан (AR-02) too', (await ln('Айгүл С.', 'AR')).n === 3 && (await ln('Нұрлан Б.', 'AR')).n === 3, [await ln('Айгүл С.', 'AR'), await ln('Нұрлан Б.', 'AR')]);
  T('report: the same seed → the same examples on every print', (await ln('Дана К.', 'AR')).ex === first, { first, again: (await ln('Дана К.', 'AR')).ex });
  await tp.selectOption('.noprint select', '0'); await tp.waitForSelector('table.prt'); await tp.waitForTimeout(300);
  T('report: «мысалсыз» — names only, not one example', (await tp.locator('table.prt ol').count()) === 0 && (await tp.locator('tr.pex').count()) === 0 && /AR-12 — /.test(await rep()));
  await tp.getByRole('button', { name: 'Басып шығару' }).click();
  T('the print button calls the browser\'s print dialog', (await tp.evaluate(() => window.__printed)) === 1);
  await tp.getByRole('link', { name: '← тізім' }).click(); await tp.waitForSelector('table.t3');
  T('back to the list', (await tp.locator('#app').innerText()).includes('Айгүл С.'));

  // 4 ─ the pupil card names stages too
  await tp.locator('table.t3 tr', { hasText: 'Айгүл С.' }).first().click(); await tp.waitForSelector('.kv'); await tp.waitForTimeout(300);
  T('pupil card: the current stage carries its name', new RegExp('AR-05 ' + AR['AR-05'].name + ' · деңгей 2').test((await tp.locator('#app').innerText()).replace(/\s+/g, ' ')), (await tp.locator('.kv').first().innerText()).replace(/\s+/g, ' '));
  T('no direct table request was ever made', !seen.some(x => !/\/rpc\/esep_/.test(x)), [...new Set(seen.filter(x => !/\/rpc\/esep_/.test(x)))]);
  T('no page errors', errs.length === 0, errs);

  await browser.close(); srv.close(); await pool.end(); await pg.end(); await admin.query(`drop database ${DB} with (force)`); await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.end();
  const bad = out.filter(x => !x).length; console.log(bad ? `${bad} FAILED of ${out.length}` : `ALL ${out.length} PASS`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ERROR', e.stack || e.message); process.exit(2); });
