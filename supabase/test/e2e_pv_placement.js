// PV's placement test logs every answer (pv/bridge.js). Real pv/ page → Playwright intercepts every request to
// *.supabase.co and executes it against a LOCAL throwaway Postgres as `anon`. Nothing here reaches the real project.
//   node supabase/test/e2e_pv_placement.js
const { chromium } = require(process.env.PW_MODULE || 'playwright'); const { Client, Pool } = require(process.env.PG_MODULE || 'pg');
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..'), DIR = path.join(__dirname, '..'), DB = 'esep_test_pvpl_' + Date.now();
const conn = db => new Client({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: db });
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(x)); };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
(async () => {
  const srv = http.createServer((q, s) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith(path.sep) || fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => e ? (s.writeHead(404), s.end()) : (s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }), s.end(b))); }).listen(8768);
  const admin = conn('postgres'); await admin.connect();
  for (const d of (await admin.query(`select datname from pg_database where datname like 'esep_test_pvpl%'`)).rows) await admin.query(`drop database ${d.datname} with (force)`);
  await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.query(`create database ${DB}`);
  const pg = conn(DB); await pg.connect(); const file = f => pg.query(fs.readFileSync(path.join(DIR, f), 'utf8'));
  await file('test/00_baseline_guess.sql');
  await pg.query(`insert into students(name,pin,klass) values ('Айару М.','1111','2А')`);
  await file('01_additive.sql'); await file('02_lock.sql'); await pg.query(`select esep_private.set_join_code('алма27')`);
  const pool = new Pool({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: DB, max: 6 });
  const backend = async route => { const rq = route.request(), u = new URL(rq.url());
    const m = u.pathname.match(/^\/rest\/v1\/rpc\/(esep_[a-z_]+)$/);
    const c = await pool.connect();
    try { await c.query('set role anon');
      if (!m) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      const args = JSON.parse(rq.postData() || '{}'), keys = Object.keys(args);
      const r = await c.query(`select public.${m[1]}(${keys.map((k, i) => `${k.replace(/\W/g, '')} => $${i + 1}`).join(', ')}) as v`, keys.map(k => args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.rows[0].v) }).catch(() => {});
    } catch (e) { return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: e.message }) }).catch(() => {}); }
    finally { await c.query('reset role').catch(() => {}); c.release(); } };

  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  await ctx.route(/supabase\.co/, backend); await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const errs = []; const page = await ctx.newPage(); page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8768/pv/'); await page.waitForSelector('#c_nm');
  await page.fill('#c_nm', 'Айару М.'); await page.fill('#c_pin', '1111'); await page.click('#c_go');
  await page.waitForSelector('#pvdiag', { timeout: 15000 });
  T('PV: a fresh pupil is offered the placement test', true);
  await page.click('#pvdiag'); await page.waitForSelector('#pt-ans');
  /* answer four placement questions: the first two right (the page tells us the answer through its own onclick), then two wrong */
  const answerOf = async () => +(await page.locator('button.check-btn').getAttribute('onclick')).match(/checkPlacement\((\d+)\)/)[1];
  for (let i = 0; i < 4; i++) { const a = await answerOf(); await page.fill('#pt-ans', String(i < 2 ? a : a + 1)); await page.click('button.check-btn'); await page.waitForTimeout(500); if (!(await page.locator('#pt-ans').count())) break; }
  await page.waitForTimeout(2500);   // Core's save/flush timers
  const st = (await pg.query(`select state from students where name='Айару М.'`)).rows[0].state || {};
  const ev = (await pg.query(`select ev from events where ev->>'ev'='answer' order by t`)).rows.map(r => r.ev);
  T('every placement answer is counted in the pupil\'s PV counters (nAns), like a runner diagnostic', st.PV && st.PV.nAns >= 3 && st.PV.nOk >= 2, st.PV && { nAns: st.PV.nAns, nOk: st.PV.nOk });
  T('…and logged as an answer event with mode «diag», a PV station id and the level\'s name in the stem', ev.length >= 3 && ev.every(e => e.mode === 'diag' && /^PV-\d\d$/.test(e.stage) && /·/.test(e.stem)) && ev.some(e => e.ok === true) && ev.some(e => e.ok === false && e.ans), ev.slice(0, 3));
  T('a wrong placement answer carries the right answer for the teacher', ev.filter(e => e.ok === false).every(e => /^\d+$/.test(String(e.ans))), ev.filter(e => e.ok === false));
  T('no page errors', errs.length === 0, errs);
  await browser.close(); srv.close(); await pool.end(); await pg.end(); await admin.query(`drop database ${DB} with (force)`); await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.end();
  const bad = out.filter(x => !x).length; console.log(bad ? `${bad} FAILED of ${out.length}` : `ALL ${out.length} PASS`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ERROR', e.stack || e.message); process.exit(2); });
