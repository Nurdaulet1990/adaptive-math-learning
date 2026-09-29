// The assistant's form (obs/) and the teacher's «Бақылау» tab. Real pages → Playwright intercepts every request to
// *.supabase.co and executes it against a LOCAL throwaway Postgres as `anon`. Nothing here reaches the real project.
//   node supabase/test/e2e_obs.js
const { chromium } = require(process.env.PW_MODULE || 'playwright'); const { Client, Pool } = require(process.env.PG_MODULE || 'pg');
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..'), DIR = path.join(__dirname, '..'), DB = 'esep_test_obs_' + Date.now();
const conn = db => new Client({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: db });
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(x)); };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
(async () => {
  const srv = http.createServer((q, s) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith(path.sep) || fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => e ? (s.writeHead(404), s.end()) : (s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }), s.end(b))); }).listen(8770);
  const admin = conn('postgres'); await admin.connect();
  for (const d of (await admin.query(`select datname from pg_database where datname like 'esep_test_obs%'`)).rows) await admin.query(`drop database ${d.datname} with (force)`);
  await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.query(`create database ${DB}`);
  const pg = conn(DB); await pg.connect(); const file = f => pg.query(fs.readFileSync(path.join(DIR, f), 'utf8'));
  await file('test/00_baseline_guess.sql');
  await pg.query(`insert into students(name,pin,klass) values ('Айгүл С.','1111','3А')`);
  await file('01_additive.sql'); await file('02_lock.sql'); await file('08_classes.sql'); await file('17_observations.sql');
  await pg.query(`select esep_private.set_teacher_secret('мұғалім-құпиясы-2026')`);
  const pool = new Pool({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: DB, max: 6 });
  let online = true;
  const backend = async route => { const rq = route.request(), u = new URL(rq.url());
    if (!online) return route.abort('internetdisconnected');
    const m = u.pathname.match(/^\/rest\/v1\/rpc\/(esep_[a-z_]+)$/);
    const c = await pool.connect();
    try { await c.query('set role anon');
      if (!m) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      const args = JSON.parse(rq.postData() || '{}'), keys = Object.keys(args);
      const r = await c.query(`select public.${m[1]}(${keys.map((k, i) => `${k.replace(/\W/g, '')} => $${i + 1}`).join(', ')}) as v`, keys.map(k => args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.rows[0].v) }).catch(() => {});
    } catch (e) { return route.fulfill({ status: /permission denied/.test(e.message) ? 401 : 400, contentType: 'application/json', body: JSON.stringify({ message: e.message }) }).catch(() => {}); }
    finally { await c.query('reset role').catch(() => {}); c.release(); } };

  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 400, height: 900 } });
  await ctx.route(/supabase\.co/, backend); await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const errs = []; const B = 'http://localhost:8770/';

  // 1 ─ the teacher sets the code
  const tp = await ctx.newPage(); tp.on('pageerror', e => errs.push('teacher: ' + e.message)); await tp.goto(B + 'teacher/#baq'); await tp.waitForSelector('#tpin');
  await tp.fill('#tpin', 'мұғалім-құпиясы-2026'); await tp.click('#tgo'); await tp.waitForSelector('#obsCode');
  T('teacher: the «Бақылау» tab says the code is not set and no form has come', /Код әлі қойылмаған/.test(await tp.locator('#app').innerText()) && /форма келген жоқ/.test(await tp.locator('#app').innerText()));
  await tp.fill('#obsCode', 'Қыран2026'); await tp.click('#obsSet'); await tp.waitForFunction(() => /Код қойылды/.test(document.getElementById('obsMsg').textContent));
  T('teacher: sets the observer code from the page', true);

  // 2 ─ the assistant: wrong code, then the right one, a lesson form with a problem
  const ap = await ctx.newPage(); ap.on('pageerror', e => errs.push('obs: ' + e.message)); await ap.goto(B + 'obs/'); await ap.waitForSelector('#cd');
  await ap.fill('#au', 'Көмекші Айгерім'); await ap.fill('#cd', 'wrong'); await ap.click('#go'); await ap.waitForSelector('#send');
  await ap.selectOption('#kl', '3А'); await ap.click('[data-chips="routes"] button[data-v="AR"]'); await ap.click('[data-chips="mood"] button[data-v="3"]');
  await ap.click('#send'); await ap.waitForFunction(() => /Код дұрыс емес/.test(document.getElementById('msg').textContent));
  T('assistant: a wrong code is refused with a clear message, nothing stored', (await pg.query(`select count(*)::int n from esep_private.observations`)).rows[0].n === 0);
  await ap.click('text=кодты ауыстыру'); await ap.waitForSelector('#cd'); await ap.fill('#cd', 'қыран2026'); await ap.click('#go'); await ap.waitForSelector('#send');
  await ap.selectOption('#kl', '3А'); await ap.click('[data-chips="routes"] button[data-v="AR"]'); await ap.click('[data-chips="routes"] button[data-v="ROOM"]');
  await ap.fill('#n', '14'); await ap.click('[data-chips="devices"] button[data-v="phone"]'); await ap.click('[data-chips="login"] button[data-v="some"]'); await ap.fill('#nlogin', '2'); await ap.click('[data-chips="loginwhy"] button[data-v="pin"]');
  await ap.click('[data-chips="net"] button[data-v="some"]'); await ap.click('[data-chips="mood"] button[data-v="4"]'); await ap.click('[data-chips="solo"] button[data-v="half"]');
  await ap.fill('#good', 'Жарыс бөлмесі бәріне ұнады');
  await ap.click('#addIssue'); await ap.waitForSelector('.issue'); await ap.selectOption('.issue select', 'bug'); await ap.fill('.issue [data-f="who"]', 'Ерасыл'); await ap.fill('.issue [data-f="where"]', 'AR-05'); await ap.fill('.issue [data-f="what"]', '<b>Тексеру</b> батырмасы басылмады'); await ap.fill('.issue [data-f="did"]', 'бетті жаңарттым');
  await ap.click('#addIssue'); await ap.fill('.issue:nth-of-type(2) [data-f="what"]', 'Кесте 5 тым оңай болды'); await ap.selectOption('.issue:nth-of-type(2) select', 'easy');
  await ap.click('#send'); await ap.waitForFunction(() => /Жіберілді/.test(document.getElementById('msg').textContent));
  const row = (await pg.query(`select kind, klass, author, form from esep_private.observations order by id desc limit 1`)).rows[0];
  T('assistant: the lesson form is stored — class, routes, login trouble, mood and both problems', row.kind === 'lesson' && row.klass === '3А' && row.author === 'Көмекші Айгерім' && row.form.routes.join() === 'AR,ROOM' && row.form.n === 14 && row.form.login === 'some' && row.form.nlogin === 2 && row.form.mood === 4 && row.form.issues.length === 2 && row.form.issues[0].where === 'AR-05' && row.form.issues[1].type === 'easy', row.form);
  T('assistant: the form is cleared for the next lesson, the code remembered', (await ap.locator('.issue').count()) === 0 && (await ap.evaluate(() => localStorage.getItem('esep_obs_code'))) === 'қыран2026');

  // 3 ─ offline: the form waits and goes when the network is back
  online = false;
  await ap.click('button:has-text("Пікір")'); await ap.waitForSelector('#period');
  await ap.fill('#period', '23–27 қыркүйек'); await ap.fill('#p1', 'Кіру ұзақ'); await ap.click('[data-chips="score"] button[data-v="4"]'); await ap.click('#send');
  await ap.waitForFunction(() => /сақталды/.test(document.getElementById('msg').textContent));
  T('assistant, offline: the feedback sheet is kept on the phone, not lost', (await ap.evaluate(() => JSON.parse(localStorage.getItem('esep_obs_queue')).length)) === 1 && /Жіберілмеген 1 форма/.test(await ap.locator('#app').innerText()));
  online = true;
  await ap.reload(); await ap.waitForSelector('#send'); await ap.waitForFunction(() => !/Жіберілмеген/.test(document.getElementById('app').innerText), null, { timeout: 8000 });
  T('…and is sent by itself once the network is back', (await pg.query(`select count(*)::int n from esep_private.observations where kind='feedback'`)).rows[0].n === 1 && (await ap.evaluate(() => JSON.parse(localStorage.getItem('esep_obs_queue') || '[]').length)) === 0);

  // 4 ─ the teacher reads it all; the assistant's HTML is text
  await tp.reload(); await tp.waitForSelector('#obsCode'); await tp.waitForTimeout(400);
  const tt = (await tp.locator('#app').innerText()).replace(/\s+/g, ' ');
  T('teacher: the lesson card shows class, routes, login trouble (2: PIN), mood, both problems with pupil and station', /3А/.test(tt) && /Көбейту мен бөлу, Жарыс бөлмесі/.test(tt) && /кейбіреуі кіре алмады \(2: PIN ұмытты\)/.test(tt) && /😀/.test(tt) && /2 мәселе/.test(tt) && /Қате \/ бағдарлама · AR-05 · Ерасыл/.test(tt) && /Тым оңай/.test(tt), tt.slice(0, 700));
  T('teacher: the feedback card shows the period, the top problem and the score', /Пікір · Көмекші Айгерім · 23–27 қыркүйек/.test(tt) && /Кіру ұзақ/.test(tt) && /★ 4\/5/.test(tt));
  T('teacher: problems by type are counted (Қате 1, Тым оңай 1)', /Мәселелер түрі бойынша · 2/.test(tt));
  T('teacher: the assistant\'s «<b>» arrived as text, not markup', (await tp.locator('#app b:has-text("Тексеру")').count()) === 0 && /<b>Тексеру<\/b>/.test(tt));
  await tp.locator('a:has-text("өшіру")').first().click(); await tp.waitForTimeout(400);
  T('teacher: deletes a form', (await pg.query(`select count(*)::int n from esep_private.observations`)).rows[0].n === 1);
  T('no page errors', errs.length === 0, errs);

  await browser.close(); srv.close(); await pool.end(); await pg.end(); await admin.query(`drop database ${DB} with (force)`); await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.end();
  const bad = out.filter(x => !x).length; console.log(bad ? `${bad} FAILED of ${out.length}` : `ALL ${out.length} PASS`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ERROR', e.stack || e.message); process.exit(2); });
