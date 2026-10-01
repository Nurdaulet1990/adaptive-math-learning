// The teacher moves a PV pupil to another station («Кезеңді қолмен қою»); the PV app must open THAT station, not
// the old one. Real pages → Playwright intercepts every request to *.supabase.co and executes it against a LOCAL
// throwaway Postgres as `anon`. Nothing here reaches the real project.   node supabase/test/e2e_pv_move.js
const { chromium } = require(process.env.PW_MODULE || 'playwright'); const { Client, Pool } = require(process.env.PG_MODULE || 'pg');
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..'), DIR = path.join(__dirname, '..'), DB = 'esep_test_pvmv_' + Date.now();
const conn = db => new Client({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: db });
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(x)); };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
(async () => {
  const srv = http.createServer((q, s) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith(path.sep) || fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => e ? (s.writeHead(404), s.end()) : (s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }), s.end(b))); }).listen(8772);
  const admin = conn('postgres'); await admin.connect();
  for (const d of (await admin.query(`select datname from pg_database where datname like 'esep_test_pvmv%'`)).rows) await admin.query(`drop database ${d.datname} with (force)`);
  await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.query(`create database ${DB}`);
  const pg = conn(DB); await pg.connect(); const file = f => pg.query(fs.readFileSync(path.join(DIR, f), 'utf8'));
  await file('test/00_baseline_guess.sql');
  await pg.query(`insert into students(name,pin,klass) values ('Айару М.','1111','2А'),('Бекзат Қ.','2222','2А')`);
  await file('01_additive.sql'); await file('02_lock.sql'); await file('08_classes.sql'); await pg.query(`select esep_private.set_teacher_secret('мұғалім-құпиясы-2026')`);
  const pool = new Pool({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: DB, max: 6 });
  const backend = async route => { const rq = route.request(), u = new URL(rq.url()); const m = u.pathname.match(/^\/rest\/v1\/rpc\/(esep_[a-z_]+)$/); const c = await pool.connect();
    try { await c.query('set role anon'); if (!m) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      const args = JSON.parse(rq.postData() || '{}'), keys = Object.keys(args);
      const r = await c.query(`select public.${m[1]}(${keys.map((k, i) => `${k.replace(/\W/g, '')} => $${i + 1}`).join(', ')}) as v`, keys.map(k => args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.rows[0].v) }).catch(() => {});
    } catch (e) { return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: e.message }) }).catch(() => {}); }
    finally { await c.query('reset role').catch(() => {}); c.release(); } };
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  await ctx.route(/supabase\.co/, backend); await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const errs = []; const B = 'http://localhost:8772/';
  /* a station's number (PV-13) is its identity, not its position: the 28 no-picture twins (PV-49…) sit between the
     originals, so «the stations before PV-13» is LEVEL_ORDER's index of it, not 9 */
  const pvState = async p => p.evaluate(() => ({ up: state.unlockedUpTo, curNo: stageNo(LEVEL_ORDER[Math.min(state.unlockedUpTo, LEVEL_ORDER.length - 1)].levelId), done: Object.keys(state.completed).filter(k => state.completed[k]).length, started: state.started }));
  const idxOf = async (p, no) => p.evaluate(no => LEVEL_ORDER.findIndex(e => stageNo(e.levelId) === no), no);
  const teacherMove = async (tp, name, to) => { await tp.goto(B + 'teacher/#oqu'); await tp.waitForSelector('#tpin, [data-route]'); if (await tp.locator('#tpin').count()) { await tp.fill('#tpin', 'мұғалім-құпиясы-2026'); await tp.click('#tgo'); await tp.waitForSelector('[data-route]'); }
    await tp.click('[data-route="PV"]'); await tp.waitForTimeout(800); await tp.locator('tr', { hasText: name }).first().click(); await tp.waitForSelector('#setst', { state: 'attached' });
    if (!(await tp.locator('#setst').isVisible())) await tp.click('summary:has-text("басқару")'); await tp.waitForSelector('#setst'); await tp.selectOption('#setst', to); await tp.click('button:has-text("Қою")'); await tp.waitForTimeout(1200); };

  // 1 ─ a pupil who has done the first three PV levels
  const page = await ctx.newPage(); page.on('pageerror', e => errs.push('pv: ' + e.message));
  await page.goto(B + 'pv/'); await page.waitForSelector('#c_nm'); await page.fill('#c_nm', 'Айару М.'); await page.fill('#c_pin', '1111'); await page.waitForFunction(() => document.getElementById('c_kl').options.length > 1, null, { timeout: 5000 }).catch(() => {}); await page.selectOption('#c_kl', '2А').catch(() => {}); await page.click('#c_go'); await page.waitForSelector('#pvdiag', { timeout: 15000 });
  await page.evaluate(() => { state.started = true; LEVEL_ORDER.slice(0, 3).forEach(e => { state.completed[e.levelId] = true; }); state.unlockedUpTo = 3; saveProgress(); }); await page.waitForTimeout(2500);
  let st = (await pg.query(`select state->'PV' s from students where name='Айару М.'`)).rows[0].s;
  const fourth = await page.evaluate(() => 'PV-' + String(stageNo(LEVEL_ORDER[3].levelId)).padStart(2, '0'));
  T('setup: three levels done, the mirror says the fourth station is current', st.stages[fourth].status === 'current' && Object.values(st.stages).filter(v => v.status === 'passed').length === 3, Object.entries(st.stages).filter(([k, v]) => v.status !== 'locked'));

  // 2 ─ the teacher moves her to PV-13
  const tp = await ctx.newPage(); tp.on('pageerror', e => errs.push('teacher: ' + e.message));
  await teacherMove(tp, 'Айару М.', 'PV-13');
  st = (await pg.query(`select state->'PV' s from students where name='Айару М.'`)).rows[0].s;
  T('teacher: PV-13 is current in the stage rows and the move is noted', st.stages['PV-13'].status === 'current' && st.moved && st.moved.to === 'PV-13', { moved: st.moved });

  // 3 ─ the pupil opens PV again: the app must be at PV-13, not PV-04
  await page.reload(); await page.waitForSelector('#workspace, .level-btn, #pvhome', { timeout: 15000 }); await page.waitForTimeout(2500);
  let s = await pvState(page); const i10 = await idxOf(page, 13);
  T('PV app opens at the station the teacher chose (PV-13), every station before it done', s.curNo === 13 && s.up === i10 && s.done === i10 && s.started === true, s);
  st = (await pg.query(`select state->'PV' s from students where name='Айару М.'`)).rows[0].s;
  T('…and the saved state agrees at once (the home page shows PV-13 too): completed rebuilt, PV-13 current, the note marked as applied', st.stages['PV-13'].status === 'current' && st.stages['PV-12'].status === 'passed' && st.movedApplied === st.moved.t && Object.keys(st.completed).length === i10, { applied: st.movedApplied, t: st.moved.t, n: Object.keys(st.completed || {}).length, s10: st.stages['PV-13'].status, s9: st.stages['PV-12'].status });
  await page.reload(); await page.waitForTimeout(2500); s = await pvState(page);
  T('a second load does not re-apply anything', s.curNo === 13 && s.done === i10, s);

  // 4 ─ moved BACK to PV-02: the later levels are open again, not done
  await teacherMove(tp, 'Айару М.', 'PV-05');
  await page.reload(); await page.waitForTimeout(2500); s = await pvState(page);
  const i5 = await idxOf(page, 5);
  T('moved back to PV-05 (c20): the app opens there, the stations before it (c1 and the within-10 ladder) done, nothing after', s.curNo === 5 && s.done === i5 && s.up === i5, Object.assign(s, { i5 }));

  // 5 ─ a pupil who never opened PV, placed by the teacher at PV-06: no placement test, straight to PV-06
  await teacherMove(tp, 'Бекзат Қ.', 'PV-06');
  const ctx2 = await browser.newContext({ viewport: { width: 420, height: 900 } }); await ctx2.route(/supabase\.co/, backend); await ctx2.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p2 = await ctx2.newPage(); p2.on('pageerror', e => errs.push('pv2: ' + e.message));
  await p2.goto(B + 'pv/'); await p2.waitForSelector('#c_nm'); await p2.fill('#c_nm', 'Бекзат Қ.'); await p2.fill('#c_pin', '2222'); await p2.waitForFunction(() => document.getElementById('c_kl').options.length > 1, null, { timeout: 5000 }).catch(() => {}); await p2.selectOption('#c_kl', '2А').catch(() => {}); await p2.click('#c_go'); await p2.waitForTimeout(3000);
  s = await pvState(p2); const i6 = await idxOf(p2, 6);
  T('a pupil placed by the teacher before ever opening PV starts at PV-06, without the placement test', s.curNo === 6 && s.done === i6 && s.started === true && /Қайта/.test(await p2.locator('#pvdiag').innerText()), Object.assign(s, { i6, diag: await p2.locator('#pvdiag').innerText() }));   // the button offers a RE-test, not the first one
  T('no page errors', errs.length === 0, errs);
  await browser.close(); srv.close(); await pool.end(); await pg.end(); await admin.query(`drop database ${DB} with (force)`); await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.end();
  const bad = out.filter(x => !x).length; console.log(bad ? `${bad} FAILED of ${out.length}` : `ALL ${out.length} PASS`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ERROR', e.stack || e.message); process.exit(2); });
