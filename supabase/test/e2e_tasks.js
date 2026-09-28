// End to end: a teacher publishes a task, a pupil sees it, works on it, and both see it done.
// Real pages (served from this repo) → every *.supabase.co request is run against a LOCAL throwaway Postgres as
// `anon`, the way PostgREST would. Nothing reaches the real project.   node supabase/test/e2e_tasks.js
const { chromium } = require(process.env.PW_MODULE || 'playwright'); const { Client, Pool } = require(process.env.PG_MODULE || 'pg');
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..'), DIR = path.join(__dirname, '..'), DB = 'esep_test_tasks_' + Date.now();
const conn = db => new Client({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: db });
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(x)); };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
(async () => {
  const srv = http.createServer((q, s) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith(path.sep) || fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => e ? (s.writeHead(404), s.end()) : (s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }), s.end(b))); }).listen(8768);
  const admin = conn('postgres'); await admin.connect();
  for (const d of (await admin.query(`select datname from pg_database where datname like 'esep_test_tasks%'`)).rows) await admin.query(`drop database ${d.datname} with (force)`);
  await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.query(`create database ${DB}`); await admin.end();
  const pg = conn(DB); await pg.connect(); const file = f => pg.query(fs.readFileSync(path.join(DIR, f), 'utf8'));
  await file('test/00_baseline_guess.sql');
  const te = { diag: { placed: 'TE-01', t: Date.now() }, stages: { 'TE-01': { status: 'current', level: 1, streak: 0, tests: [], seenCard: true } } };
  // Айгүл has never opened Теңдеулер (no placement test yet): the task must still open straight away, not the placement test
  await pg.query(`insert into students(name,pin,klass,state) values ('Айгүл С.','1111','3А','{}'::jsonb),('Дана К.','2222','3Ә',$1::jsonb)`, [JSON.stringify({ TE: te })]);
  await file('01_additive.sql'); await file('02_lock.sql'); await file('08_classes.sql'); await file('16_tasks.sql');
  await pg.query(`insert into esep_private.classes(name) values ('3А'),('3Ә') on conflict do nothing`);
  await pg.query(`select esep_private.set_teacher_secret('мұғалім-құпиясы-2026')`);
  const pool = new Pool({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: DB, max: 6 });
  const seen = [];
  const backend = async route => { const rq = route.request(), u = new URL(rq.url()); seen.push(rq.method() + ' ' + u.pathname);
    const m = u.pathname.match(/^\/rest\/v1\/rpc\/(esep_[a-z_]+)$/);
    const c = await pool.connect();
    try { await c.query('set role anon');
      if (!m) { await c.query(`select * from public.${u.pathname.split('/').pop().replace(/\W/g, '')} limit 1`); return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); }
      const args = JSON.parse(rq.postData() || '{}'), keys = Object.keys(args);
      const r = await c.query(`select public.${m[1]}(${keys.map((k, i) => `${k.replace(/\W/g, '')} => $${i + 1}`).join(', ')}) as v`, keys.map(k => Array.isArray(args[k]) && /^p_(stages|klasses|students)$/.test(k) ? args[k] : args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])   /* text[] parameters as arrays (PostgREST does this from the function's types), jsonb ones as JSON */);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.rows[0].v) }).catch(() => {});
    } catch (e) { return route.fulfill({ status: /permission denied/.test(e.message) ? 401 : 400, contentType: 'application/json', body: JSON.stringify({ message: e.message }) }).catch(() => {}); }
    finally { await c.query('reset role').catch(() => {}); c.release(); } };


  const browser = await chromium.launch(); const errs = [];
  const mk = async () => { const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1100, height: 900 } }); await ctx.route(/supabase\.co/, backend); await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort()); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); return { ctx, p }; };
  const B = 'http://localhost:8768/';
  // ── the teacher publishes: TE-03 (not reached by the pupils yet), 3 right answers, to 3А ──
  const { p: tp } = await mk();
  await tp.goto(B + 'teacher/'); await tp.fill('#tpin', 'мұғалім-құпиясы-2026'); await tp.click('#tgo'); await tp.waitForSelector('.ttabs');
  await tp.click('.ttabs a[href="#task"]'); await tp.waitForSelector('.tkst input');
  await tp.locator('.tkck', { hasText: 'TE-03' }).first().locator('input').check();
  await tp.fill('input[type=number]', '3'); await tp.dispatchEvent('input[type=number]', 'change');
  await tp.locator('.tchip', { hasText: '3А сыныбы' }).click(); await tp.fill('input[placeholder^="мысалы"]', 'жұмаға дейін');
  await tp.click('#tkGo'); await tp.waitForSelector('.tkc');
  const t1 = (await tp.locator('.tkc').first().innerText()).replace(/\s+/g, ' ');
  if (process.env.SHOTS) await tp.screenshot({ path: path.join(process.env.SHOTS, 'task-teacher.png'), fullPage: true });
  T('teacher: the task is published — TE-03, 3 right answers, 0 / 1 done', /TE · TE-03/.test(t1) && /3 есеп дұрыс/.test(t1) && /0 \/ 1/.test(t1) && /жұмаға дейін/.test(t1), t1);
  // ── the pupil in 3А sees it, starts it, answers three right ──
  const { p: ap } = await mk();
  await ap.goto(B); await ap.waitForSelector('#c_nm'); await ap.fill('#c_nm', 'Айгүл С.'); await ap.fill('#c_pin', '1111'); await ap.click('#c_go');
  await ap.waitForSelector('#tasks .tk', { timeout: 10000 });
  const c1 = (await ap.locator('#tasks .tk').innerText()).replace(/\s+/g, ' ');
  T('pupil: the task card on Бүгін — what, which station, the note, 0 / 3', /3 есепті дұрыс шығар/.test(c1) && /TE-03/.test(c1) && /жұмаға дейін/.test(c1) && /0 \/ 3/.test(c1), c1);
  if (process.env.SHOTS) { await ap.setViewportSize({ width: 390, height: 844 }); await ap.screenshot({ path: path.join(process.env.SHOTS, 'task-pupil.png') }); await ap.setViewportSize({ width: 1100, height: 900 }); }
  T('pupil: Бүгін carries a badge 1', (await ap.locator('#bbadge').innerText()) === '1');
  await ap.click('#tasks .tk-go'); await ap.waitForURL(/te\//);
  for (let k = 0; k < 4 && !(await ap.locator('.choice,#ans').count()); k++) { const b = ap.locator('.btn.wide'); if (await b.count()) await b.first().click(); await ap.waitForTimeout(500); }
  T('pupil: «Бастау» opens TE-03 practice straight away — no placement test first, though she never started the route', await ap.evaluate(() => !!window._Q && window._Q.o && window._Q.o.mode === 'practice' && (window._Q.q.stage === 'TE-03' || window._Q.o.stId === 'TE-03' || /TE-03/.test(JSON.stringify(window._Q.o)))), await ap.evaluate(() => window._Q && { mode: window._Q.o && window._Q.o.mode, o: JSON.stringify(window._Q.o).slice(0, 120) }));
  const right = async () => { await ap.waitForFunction(() => window._Q && !window._Q.done && document.querySelector('.choice,#ans')); const a = await ap.evaluate(() => String(window._Q.q.ans));
    if (await ap.locator('#ans').count()) await ap.fill('#ans', a); else await ap.locator('.choice').evaluateAll((bs, v) => bs.find(b => b.dataset.v === v).click(), a); await ap.click('#ansBtn'); };
  T('while working: the pill shows «Тапсырма 0 / 3»', /Тапсырма\s*0 \/ 3/.test(await ap.locator('#taskpill').innerText()), await ap.locator('#taskpill').count());
  for (let i = 0; i < 3; i++) { await right(); await ap.waitForSelector('#nextBtn');
    if (i === 1) { T('…and counts every right answer (2 / 3)', /2 \/ 3/.test(await ap.locator('#taskpill').innerText()));
      if (process.env.SHOTS) { await ap.setViewportSize({ width: 390, height: 844 }); await ap.waitForTimeout(400); await ap.screenshot({ path: path.join(process.env.SHOTS, 'task-pill.png') }); await ap.setViewportSize({ width: 1100, height: 900 }); } }
    if (i < 2) await ap.click('#nextBtn'); }
  await ap.waitForSelector('.taskdone', { timeout: 5000 }).catch(() => {});
  if (process.env.SHOTS) { await ap.setViewportSize({ width: 390, height: 844 }); await ap.waitForTimeout(600); await ap.screenshot({ path: path.join(process.env.SHOTS, 'task-done-dialog.png') }); await ap.setViewportSize({ width: 1100, height: 900 }); }
  T('at the goal: «Тапсырма орындалды!» with a way home, the pill gone', /Тапсырма орындалды/.test(await ap.locator('.taskdone').innerText().catch(() => '')) && (await ap.locator('#taskpill').count()) === 0);
  await ap.waitForTimeout(3500);   // the answers go to the server in the next sync
  const got = +(await pg.query(`select count(*) n from public.events where ev->>'stage'='TE-03' and ev->>'ok'='true'`)).rows[0].n;
  T('the three right answers on TE-03 reached the server', got === 3, got);
  await ap.goto(B); await ap.waitForSelector('#tasks .tk.done', { timeout: 10000 });
  if (process.env.SHOTS) { await ap.setViewportSize({ width: 390, height: 844 }); await ap.waitForTimeout(300); await ap.screenshot({ path: path.join(process.env.SHOTS, 'task-pupil-done.png') }); }
  T('pupil: back on Бүгін the card is done ✓ and the badge is gone', /Орындалды/.test(await ap.locator('#tasks .tk').innerText()) && await ap.locator('#bbadge').isHidden());
  // ── a pupil of 3Ә does not see it ──
  const { p: dp } = await mk();
  await dp.goto(B); await dp.waitForSelector('#c_nm'); await dp.fill('#c_nm', 'Дана К.'); await dp.fill('#c_pin', '2222'); await dp.click('#c_go'); await dp.waitForSelector('.tabbar'); await dp.waitForTimeout(1500);
  T('another class does not see it', (await dp.locator('#tasks .tk').count()) === 0);
  // ── the teacher sees it done ──
  await tp.reload(); await tp.waitForSelector('.tkc');
  const t2 = (await tp.locator('.tkc').first().innerText()).replace(/\s+/g, ' ');
  T('teacher: 1 / 1 done', /1 \/ 1/.test(t2), t2);
  await tp.locator('.tkc summary').first().click(); if (process.env.SHOTS) await tp.screenshot({ path: path.join(process.env.SHOTS, 'task-teacher-done.png'), fullPage: true }); const row = (await tp.locator('.tkc table tr', { hasText: 'Айгүл' }).innerText()).replace(/\s+/g, ' ');
  T('teacher: Айгүл 3 / 3 · орындады', /3 \/ 3/.test(row) && /орындады/.test(row), row);
  await tp.click('text=Аяқтау'); await tp.waitForSelector('.tkc.closed');
  await ap.reload(); await ap.waitForSelector('.tabbar'); await ap.waitForTimeout(1500);
  T('closed by the teacher → gone from the pupil', (await ap.locator('#tasks .tk').count()) === 0);
  // ── Орын мәні (PV, the legacy route) can be given too, and its level opens straight away ──
  await tp.click('.tchip:has-text("PV · ")'); await tp.waitForSelector('.tkst input');
  const pvRow = tp.locator('.tkck', { hasText: 'PV-12' }).first(); const pvName = (await pvRow.innerText()).replace(/\s+/g, ' ');
  await pvRow.locator('input').check(); await tp.locator('.tchip', { hasText: '3А сыныбы' }).click(); await tp.click('#tkGo'); await tp.waitForSelector('.tkc');
  T('teacher: a PV task is published', /PV · PV-12/.test((await tp.locator('.tkc').first().innerText()).replace(/\s+/g, ' ')), pvName);
  await ap.goto(B + '?pv'); await ap.waitForSelector('#tasks .tk'); await ap.click('#tasks .tk-go'); await ap.waitForURL(/pv\//);
  await ap.waitForFunction(() => typeof state !== 'undefined' && state.level, null, { timeout: 15000 }).catch(() => {});   // PV keeps `state` as a top-level let, not on window
  const lv = await ap.evaluate(() => ({ level: typeof state !== 'undefined' && state.level, diag: typeof state !== 'undefined' && state.diagnostic, url: location.search }));
  T('pupil: «Бастау» opens that PV level at once — locked for her, no placement test first', lv.level && !lv.diag && lv.url === '' && await ap.evaluate(l => typeof STAGE_NO !== 'undefined' && STAGE_NO[l] === 12, lv.level)   /* PV-12 = STAGE_NO 12 */, lv);
  T('no page errors', errs.length === 0, errs.slice(0, 3));
  await browser.close(); await pool.end(); await pg.end(); srv.close();
  const failed = out.filter(x => !x).length; console.log(failed ? `${failed} FAILED of ${out.length}` : `ALL ${out.length} PASS`);
  const g = conn('postgres'); await g.connect(); await g.query(`drop database ${DB} with (force)`); await g.end(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
