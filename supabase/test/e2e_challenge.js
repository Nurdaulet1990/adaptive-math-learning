// Two pupils, two browsers, one challenge — real pages against a LOCAL throwaway Postgres as role anon.   node supabase/test/e2e_challenge.js
const { chromium } = require(process.env.PW_MODULE || 'playwright'); const { Client, Pool } = require(process.env.PG_MODULE || 'pg');
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..'), DIR = path.join(__dirname, '..'), DB = 'esep_test_e2ech_' + Date.now();
const cfg = db => ({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: db });
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(x)); };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const passed = ts => ({ AR: { diag: { placed: 'AR-01', t: 1 }, stages: Object.fromEntries(ts.map(t => [({ 2: 'AR-04', 5: 'AR-05', 10: 'AR-06', 3: 'AR-09' })[t], { status: 'passed', level: 3, tests: [] }])) } });
(async () => {
  const srv = http.createServer((q, s) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => e ? (s.writeHead(404), s.end()) : (s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }), s.end(b))); }).listen(8768);
  const admin = new Client(cfg('postgres')); await admin.connect();
  for (const d of (await admin.query(`select datname from pg_database where datname like 'esep_test_%'`)).rows) await admin.query(`drop database ${d.datname}`);
  await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.query(`create database ${DB}`);
  const pg = new Client(cfg(DB)); await pg.connect(); const pool = new Pool(Object.assign(cfg(DB), { max: 6 })); const file = f => pg.query(fs.readFileSync(path.join(DIR, f), 'utf8'));
  for (const f of ['test/00_baseline_guess.sql', '01_additive.sql', '02_lock.sql']) await file(f);
  const anon = async (sql, args) => { const c = await pool.connect(); try { await c.query('set role anon'); return await c.query(sql, args); } finally { await c.query('reset role').catch(() => {}); c.release(); } };
  const who = {}; for (const [n, ts] of [['Айгүл С.', [2, 5, 10, 3]], ['Ерасыл Т.', [2, 5, 10]]]) { const r = (await anon(`select public.esep_login($1,'1111','3А') v`, [n])).rows[0].v; who[n] = { id: r.student.id, name: n, klass: '3А', token: r.token }; await pg.query(`update students set state=$2 where id=$1`, [r.student.id, JSON.stringify(passed(ts))]); }

  const backend = async route => { const rq = route.request(), m = new URL(rq.url()).pathname.match(/^\/rest\/v1\/rpc\/(esep_[a-z_]+)$/); if (!m) return route.fulfill({ status: 401, body: '{}' });
    try { const args = JSON.parse(rq.postData() || '{}'), k = Object.keys(args);
      const r = await anon(`select public.${m[1]}(${k.map((x, i) => `${x.replace(/\W/g, '')} => $${i + 1}`).join(', ')}) v`, k.map(x => args[x] !== null && typeof args[x] === 'object' ? JSON.stringify(args[x]) : args[x]));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.rows[0].v) }).catch(() => {});
    } catch (e) { return route.fulfill({ status: /does not exist/.test(e.message) ? 404 : 400, contentType: 'application/json', body: JSON.stringify({ message: e.message }) }).catch(() => {}); } };
  const browser = await chromium.launch(); const errs = [];
  const as = async n => { const ctx = await browser.newContext({ viewport: { width: 390, height: 860 }, deviceScaleFactor: 2 }); await ctx.route(/supabase\.co/, backend); await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await ctx.addInitScript(s => localStorage.setItem('esep_session_v1', JSON.stringify(s)), who[n]); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(n + ': ' + e.message)); return p; };
  const B = 'http://localhost:8768/'; const A = await as('Айгүл С.'), E = await as('Ерасыл Т.');

  await A.goto(B); await A.waitForSelector('.ring', { timeout: 8000 }).catch(async () => { console.log('DBG', errs, (await A.locator('body').innerText()).slice(0, 300)); }); await A.waitForTimeout(600);
  T('before 04_challenges.sql is installed the portal simply shows no challenge card, no errors', (await A.locator('#duel').innerText()).trim() === '' && errs.length === 0, errs);
  await file('04_challenges.sql');

  // A starts a challenge and plays 8 of 10
  await A.goto(B + 'challenge/'); await A.click('#newBtn'); await A.getByRole('button', { name: 'Ерасыл Т.' }).click();
  T('pick: only tables BOTH have passed are offered (2, 5, 10 — not Айгүл\'s 3)', JSON.stringify(await A.locator('[data-t]').evaluateAll(b => b.map(x => +x.dataset.t))) === '[2,5,10]');
  await A.locator('[data-t="5"]').click(); await A.click('#goBtn');
  const tap = async (p, n) => { for (const d of String(n)) await p.locator(`[data-k="${d}"]`).click(); await p.locator('[data-k="OK"]').click(); };
  for (let i = 0; i < 10; i++) { const [a, b] = (await A.locator('#qt').innerText()).split('×').map(Number); await tap(A, i === 2 || i === 6 ? a * b + 1 : a * b); }
  await A.waitForSelector('text=Шақыру жіберілді'); const aText = (await A.locator('#app').innerText()).replace(/\n/g, ' ');
  T('challenger: «sent», own 8/10 shown, opponent «?», the two misses listed for review', /8 \/ 10/.test(aText) && /\?/.test(aText) && /әлі ойнаған жоқ/.test(aText) && /Қайталап ал/.test(aText), aText);

  // B sees it on the portal, accepts, plays 10 of 10 with the keyboard
  await E.goto(B); await E.waitForSelector('#duel .card'); const card = (await E.locator('#duel').innerText()).replace(/\n/g, ' ');
  T('challenged: portal card «Айгүл сені жарысқа шақырды · 5-ке көбейту», no score on it', /Айгүл сені жарысқа шақырды/.test(card) && /5-ке көбейту/.test(card) && !/\d \/ 10|8\/10/.test(card), card);
  await E.locator('#duel a.btn').first().click(); await E.waitForSelector('#goBtn'); await E.click('#goBtn');
  const seen = []; for (let i = 0; i < 10; i++) { const t = await E.locator('#qt').innerText(); seen.push(t); const [a, b] = t.split('×').map(Number); if (i === 3) { await E.keyboard.type('2'); await E.screenshot({ path: path.join(__dirname, 'challenge-play.png') }); await E.keyboard.press('Backspace'); } await E.keyboard.type(String(a * b)); await E.keyboard.press('Enter'); }
  await E.waitForSelector('text=Жеңдің!'); const eText = (await E.locator('#app').innerText()).replace(/\n/g, ' ');
  T('challenged: 10/10 → «Жеңдің!», NOW sees Айгүл\'s 8/10, 3 stars vs 1', /10 \/ 10/.test(eText) && /8 \/ 10/.test(eText) && /Саған 3 жұлдыз, Айгүл 1 жұлдыз/.test(eText), eText);
  const row = (await pg.query(`select from_ok,to_ok,items from esep_private.challenges`)).rows[0];
  T('database: marked by the server (8 and 10); B was served the very same ten facts', row.from_ok === 8 && row.to_ok === 10 && JSON.stringify(row.items.map(([a, b]) => `${a} × ${b}`)) === JSON.stringify(seen), row);

  // A learns the result on the portal, once
  await A.goto(B); await A.waitForSelector('#duel .card'); const res = (await A.locator('#duel').innerText()).replace(/\n/g, ' ');
  T('challenger: portal shows the result + challenge stars', /Ерасыл жауап берді — бұл жолы ол озды/.test(res) && /сен 8\/10, Ерасыл 10\/10/.test(res) && /★ 1/.test(res), res);
  await A.screenshot({ path: path.join(__dirname, 'challenge-portal.png'), fullPage: true });
  await A.reload(); await A.waitForSelector('#duel a'); T('…and only once', (await A.locator('#duel .card').count()) === 0);
  await E.goto(B + 'challenge/'); await E.waitForSelector('#newBtn'); await E.screenshot({ path: path.join(__dirname, 'challenge-hub.png'), fullPage: true });
  T('hub lists the finished challenge 10 : 8', /10 : 8/.test(await E.locator('#app').innerText()));
  await E.goto(B + 'challenge/?id=1'); await E.waitForSelector('.card h2'); T('re-opening a played challenge is refused politely', /ойнап қойғансың/.test(await E.locator('#app').innerText()));
  T('no page errors', errs.length === 0, errs);

  await browser.close(); srv.close(); await pool.end(); await pg.end(); await admin.query(`drop database ${DB}`); await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.end();
  const bad = out.filter(x => !x).length; console.log(bad ? `${bad} FAILED of ${out.length}` : `ALL ${out.length} PASS`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ERROR', e.stack || e.message); process.exit(2); });
