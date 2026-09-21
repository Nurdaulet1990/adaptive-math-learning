// End-to-end rehearsal: real pages (served from this repo) → Playwright intercepts every request to *.supabase.co
// and executes it against a LOCAL throwaway Postgres AS THE `anon` ROLE, after 01_additive + 02_lock.
// Nothing here ever reaches the real project.   node supabase/test/e2e.js
const { chromium } = require(process.env.PW_MODULE || 'playwright'); const { Client, Pool } = require(process.env.PG_MODULE || 'pg');
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..'), DIR = path.join(__dirname, '..'), DB = 'esep_test_e2e_' + Date.now();
const conn = db => new Client({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: db });
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(x)); };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
(async () => {
  const srv = http.createServer((q, s) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith(path.sep) || fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => e ? (s.writeHead(404), s.end()) : (s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }), s.end(b))); }).listen(8766);
  const admin = conn('postgres'); await admin.connect();
  for (const d of (await admin.query(`select datname from pg_database where datname like 'esep_test_%'`)).rows) await admin.query(`drop database ${d.datname}`);
  await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.query(`create database ${DB}`);
  const pg = conn(DB); await pg.connect(); const file = f => pg.query(fs.readFileSync(path.join(DIR, f), 'utf8'));
  await file('test/00_baseline_guess.sql');
  await pg.query(`insert into students(name,pin,klass) values ('Ерасыл Т.','2222','3А'),('Дана К.','3333','3А'),('Нұрлан Б.','4444','3А'),('Мадина Ә.','5555','3Ә'),('Әлихан Ж.','6666','3Ә'),('Сәуле М.','7777','3Ә')`);
  await file('01_additive.sql'); await file('02_lock.sql'); await pg.query(`select esep_private.set_teacher_secret('мұғалім-құпиясы-2026')`); await pg.query(`select esep_private.set_join_code('алма27')`);
  const ids = async () => Object.fromEntries((await pg.query(`select name,id from students`)).rows.map(x => [x.name, x.id]));
  for (const [nm, k] of [['Дана К.', 12], ['Ерасыл Т.', 7], ['Мадина Ә.', 20], ['Әлихан Ж.', 4]]) for (let i = 0; i < k; i++)
    await pg.query(`insert into events(student_id,t,ev) values ($1,now(),$2)`, [(await ids())[nm], JSON.stringify({ ev: 'answer', ok: true, hints: 0, mode: 'practice', id: nm + i })]);
  await file('01_additive.sql');   // the one-off backfill turns those rows into board counters

  const pool = new Pool({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: DB, max: 6 });
  let online = true; const seen = [];
  const backend = async route => { const rq = route.request(), u = new URL(rq.url()); seen.push(rq.method() + ' ' + u.pathname);
    if (!online) return route.abort('internetdisconnected');
    const m = u.pathname.match(/^\/rest\/v1\/rpc\/(esep_[a-z_]+)$/);
    const c = await pool.connect();   // one connection per request: concurrent page requests must not share a `set role`
    try { await c.query('set role anon');
      if (!m) { await c.query(`select * from public.${u.pathname.split('/').pop().replace(/\W/g, '')} limit 1`); return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); }
      const args = JSON.parse(rq.postData() || '{}'), keys = Object.keys(args);
      const r = await c.query(`select public.${m[1]}(${keys.map((k, i) => `${k.replace(/\W/g, '')} => $${i + 1}`).join(', ')}) as v`, keys.map(k => args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.rows[0].v) }).catch(() => {});
    } catch (e) { return route.fulfill({ status: /permission denied/.test(e.message) ? 401 : 400, contentType: 'application/json', body: JSON.stringify({ message: e.message }) }).catch(() => {}); }
    finally { await c.query('reset role').catch(() => {}); c.release(); } };

  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } }); const page = await ctx.newPage();
  await ctx.route(/supabase\.co/, backend); await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const B = 'http://localhost:8766/';

  // 1 ─ wrong PIN for an existing pupil, then a first-time registration
  await page.goto(B); await page.waitForSelector('#c_nm');
  await page.fill('#c_nm', 'ерасыл т.'); await page.fill('#c_pin', '0000'); await page.click('#c_go'); await page.waitForFunction(() => /PIN басқа/.test(document.getElementById('c_msg').textContent));
  T('login screen: wrong PIN is refused by the SERVER', true);
  await page.fill('#c_nm', 'Айгүл С.'); await page.fill('#c_pin', '1111'); await page.fill('#c_kl', '3а'); await page.click('#c_go');
  await page.waitForSelector('#c_code', { state: 'visible' });
  T('a NEW name is asked for the school code (strangers cannot register into a class)', /мектеп кодын жаз/.test(await page.locator('#c_msg').innerText()) && (await pg.query(`select count(*)::int n from students where name='Айгүл С.'`)).rows[0].n === 0);
  await page.fill('#c_code', 'Алма27'); await page.click('#c_go'); await page.waitForSelector('.ring');
  const sess = await page.evaluate(() => JSON.parse(localStorage.getItem('esep_session_v1')));
  T('registered + logged in, token stored, no PIN kept in the browser', /^[0-9a-f]{48}$/.test(sess.token) && !JSON.stringify(await page.evaluate(() => ({ ...localStorage }))).includes('1111'), sess);
  const me = (await ids())['Айгүл С.'];
  T('database: new pupil has a hash, no plaintext', (r => r.pin === null && /^\$2a\$/.test(r.pin_hash))((await pg.query(`select pin,pin_hash from students where id=$1`, [me])).rows[0]));

  // 2 ─ practise in a real route; progress + events arrive through the functions
  await pg.query(`update students set state=$2 where id=$1`, [me, JSON.stringify({ FR: { diag: { placed: 'FR-01', t: Date.now() }, stages: { 'FR-01': { status: 'current', level: 1, streak: 0, wrong: 0, l3streak: 0, testUnlocked: false, tests: [], seenCard: true } } } })]);
  await page.goto(B + 'fr/'); await page.waitForSelector('[data-pr]'); await page.locator('[data-pr]').first().click();
  const answerRight = async () => { await page.waitForFunction(() => window._Q && !window._Q.done && document.querySelector('.choice,#ans'));
    const ans = await page.evaluate(() => String(window._Q.q.ans));
    if (await page.locator('#ans').count()) await page.fill('#ans', ans); else await page.locator(`.choice[data-v="${ans}"]`).click();
    await page.click('#ansBtn'); await page.waitForSelector('#nextBtn'); };
  for (let i = 0; i < 3; i++) { await answerRight(); if (i < 2) await page.click('#nextBtn'); }
  await page.waitForTimeout(3500);
  let row = (await pg.query(`select state from students where id=$1`, [me])).rows[0].state; const today = await page.evaluate(() => Core.ymd(new Date()));
  T('3 answers → state saved through esep_save (nAns=3, _days[today]=3)', row.FR.nAns === 3 && row._days && row._days[today] === 3, row);
  T('3 answers → events stored under MY id through esep_events', (await pg.query(`select count(*)::int n from events where student_id=$1 and ev->>'ev'='answer'`, [me])).rows[0].n === 3);

  // 3 ─ offline: two more answers, reload while still offline, come back online → nothing lost
  online = false; await page.click('#nextBtn'); await answerRight(); await page.click('#nextBtn'); await answerRight();
  await page.goto(B).catch(() => {}); await page.waitForSelector('.ring');
  T('offline reload: portal still opens from the cache, goal ring shows 5', (await page.locator('.ring b').innerText()) === '5');
  online = true; await page.reload(); await page.waitForSelector('.ring'); await page.waitForTimeout(3500);
  row = (await pg.query(`select state from students where id=$1`, [me])).rows[0].state;
  T('back online: the NEWER local state won and reached the server (was lost before)', row.FR.nAns === 5 && row._days[today] === 5, { nAns: row.FR.nAns, days: row._days });
  if(process.env.DEBUG){ console.log('queue', await page.evaluate(()=>JSON.parse(localStorage.getItem('esep_cache_v1')).queue.map(e=>[e.sid,e.ev.ev]))); console.log('db', (await pg.query(`select ev->>'ev' e, count(*)::int n from events where student_id=$1 group by 1`,[me])).rows); console.log(seen.slice(-12)); }
  T('back online: queued events delivered', (await pg.query(`select count(*)::int n from events where student_id=$1 and ev->>'ev'='answer'`, [me])).rows[0].n === 5);

  // 4 ─ portal: continue card + class board
  await page.reload(); await page.waitForSelector('#board .card');
  const board = await page.locator('#board').innerText();
  T('portal: continue card points at fr/', (await page.locator('.go').getAttribute('href')) === 'fr/');
  T('portal: board shows my class top (Дана 12, Ерасыл 7, Сен 5), no other class names', /Дана К\.\s*12/.test(board.replace(/\n/g, ' ')) && /Ерасыл Т\.\s*7/.test(board.replace(/\n/g, ' ')) && /Сен\s*5/.test(board.replace(/\n/g, ' ')) && !/Мадина/.test(board), board);
  await page.locator('[data-t="cls"]').click(); const cls = (await page.locator('#board').innerText()).replace(/\n/g, ' ');
  T('portal: class tab shows per-pupil averages 3Ә 8 · 3А 6', /3Ә\s*8/.test(cls) && /3А · сенің сыныбың\s*6/.test(cls), cls);

  // 5 ─ teacher page, with hostile rows in the database
  const evil = `<img src=x onerror="window.__xss=1">`;
  await pg.query(`insert into events(student_id,t,ev) values ($1,now(),$2),($1,now(),$3)`, [me, JSON.stringify({ ev: 'answer', route: 'FR', stage: evil, lvl: evil, ok: false, hints: evil, stem: evil, given: evil, ans: evil }), JSON.stringify({ ev: 'test', route: 'FR', stage: evil, ok: evil, n: evil, pass: true })]);
  // a pupil with a valid token writes a hostile STATE through the API: a counter that is HTML, a stage that is null
  const mal = (await (async () => { const c = await pool.connect(); try { await c.query('set role anon'); return (await c.query(`select public.esep_login('Ерасыл Т.','2222','') v`)).rows[0].v.token; } finally { await c.query('reset role'); c.release(); } })());
  { const c = await pool.connect(); try { await c.query('set role anon'); await c.query(`select public.esep_save($1,$2::jsonb,1)`, [mal, JSON.stringify({ FR: { nAns: evil, nOk: evil, nHint: evil, diag: 'x', stages: { a: null, 'FR-01': { status: 'current', level: evil, streak: evil, tests: 'x' } } }, WP: { stages: { a: null } } })]); } finally { await c.query('reset role'); c.release(); } }
  await pg.query(`update students set name=$1 where name='Дана К.'`, ['=HYPERLINK("http://x","Дана")']);
  await pg.query(`update students set klass=$1, state = state || $2::jsonb where name='Нұрлан Б.'`, [`"><img src=x onerror="window.__xss=1">`, JSON.stringify({ FR: { diag: { placed: evil, t: 'x' }, stages: { [evil]: { status: 'current', level: evil, streak: evil } }, nAns: 9, nOk: 1 } })]);
  const tp = await ctx.newPage(); tp.on('pageerror', e => errs.push('teacher: ' + e.message)); await tp.goto(B + 'teacher/'); await tp.waitForSelector('#tpin');
  await tp.fill('#tpin', '1234'); await tp.click('#tgo'); await tp.waitForFunction(() => /дұрыс емес/.test(document.getElementById('pinMsg').textContent));
  T('teacher: the old 1234 no longer opens anything', !(await tp.evaluate(() => sessionStorage.getItem('esep_tt'))));
  await tp.fill('#tpin', 'мұғалім-құпиясы-2026'); await tp.click('#tgo'); await tp.waitForSelector('table.t3');
  await tp.waitForTimeout(600);
  T('teacher: list loads with a hostile pupil state in it (HTML counter, null stage) — page alive, nothing executed', (await tp.evaluate(() => window.__xss)) === undefined && (await tp.locator('img').count()) === 0 && (await tp.locator('tr', { hasText: 'Ерасыл Т.' }).count()) >= 1);
  // «барлық бағыт» is the default view: the day table adds up every route; choosing one route narrows it
  { const two = (await pg.query(`select id from students where name='Ерасыл Т.'`)).rows[0].id;
    const cell = async () => { const r = tp.locator('#dayBody tr', { hasText: 'Ерасыл Т.' }); return (await r.count()) ? +(await r.locator('td').nth(3).innerText()) : 0; };
    await tp.waitForFunction(() => !/Жүктелуде/.test(document.getElementById('dayBody').textContent)); const before = await cell();
    await pg.query(`insert into events(student_id,t,ev) select $1, now(), jsonb_build_object('ev','answer','route',r,'stage',r||'-01','ok',true,'hints',0) from unnest(array['WP','WP','WP','AR','AR']) r`, [two]);
    await tp.evaluate(() => showTeacher()); await tp.waitForSelector('#dayBody table'); await tp.waitForTimeout(300);
    const all = await cell() - before;
    await tp.selectOption('select >> nth=0', 'AR'); await tp.waitForSelector('#dayBody table'); await tp.waitForTimeout(300); const ar = await cell();
    T('teacher: «барлық бағыт» counts a pupil\'s answers in every route (3 WP + 2 AR = 5); picking AR shows 2', all === 5 && ar === 2, { before, all, ar });
    T('teacher: the all-routes view is the default and still executes nothing from hostile rows', (await tp.evaluate(() => window.__xss)) === undefined && (await tp.locator('img').count()) === 0);
    await tp.selectOption('select >> nth=0', 'ALL'); await tp.waitForSelector('#dayBody table'); await tp.waitForTimeout(300); }
  const csv = await tp.evaluate(() => new Promise(res => { const o = URL.createObjectURL; URL.createObjectURL = b => { b.text().then(res); return o.call(URL, b); }; exportCSV(); }));
  T('teacher: CSV export neutralises a name that starts like a formula', /"'=HYPERLINK/.test(csv) && !/;"=HYPERLINK|^"=HYPERLINK/m.test(csv), csv.slice(0, 300));
  await tp.selectOption('select >> nth=0', 'FR'); await tp.waitForSelector('table.t3'); await tp.waitForTimeout(800);
  await tp.locator('tr', { hasText: 'Айгүл С.' }).first().click(); await tp.waitForSelector('#setst'); await tp.waitForTimeout(500);
  T('teacher: hostile event/state values render as text, nothing executes', (await tp.evaluate(() => window.__xss)) === undefined && (await tp.locator('img').count()) === 0 && /onerror/.test(await tp.locator('#app').innerText()) && !/NaN/.test(await tp.locator('#app').innerText()));
  await pg.query(`update students set state = jsonb_set(state, '{AR}', '{"nAns": 77}'::jsonb) where id=$1`, [me]);   // progress made after the teacher's list was loaded
  await tp.fill('#setst', 'FR-03'); await tp.getByRole('button', { name: 'Қою' }).click(); await tp.waitForTimeout(1200);
  row = (await pg.query(`select state from students where id=$1`, [me])).rows[0].state;
  T('teacher sets a stage from a stale list: the change lands AND the pupil\'s newer progress elsewhere survives', row.FR.stages['FR-03'].status === 'current' && row.AR && row.AR.nAns === 77 && row._t > Date.now() - 60000, { fr: row.FR.stages['FR-03'], ar: row.AR });
  await tp.fill('#newpin', '2468'); await tp.getByRole('button', { name: 'Сақтау' }).click(); await tp.waitForFunction(() => /Жаңа PIN сақталды/.test(document.getElementById('tmsg').textContent));
  await page.reload(); await page.waitForSelector('#c_nm');
  T('teacher reset the PIN → the pupil\'s session is dead everywhere, login screen is back', true);
  await page.locator('#c_known button').first().click(); await page.fill('#c_pin', '1111'); await page.click('#c_go'); await page.waitForFunction(() => /PIN басқа/.test(document.getElementById('c_msg').textContent));
  await page.fill('#c_pin', '2468'); await page.click('#c_go'); await page.waitForSelector('.ring');
  T('"was here before" only fills the name: old PIN refused, new PIN works, progress intact', (await page.locator('.ring b').innerText()) === '5');
  await tp.getByRole('link', { name: 'шығу' }).click(); await tp.waitForSelector('#tpin');
  T('teacher logout kills the token on the server', (await pg.query(`select count(*)::int n from esep_private.sessions where role='teacher'`)).rows[0].n === 0);
  T('no direct table request was ever made by the new client', !seen.some(x => !/\/rpc\/esep_/.test(x)), [...new Set(seen.filter(x => !/\/rpc\/esep_/.test(x)))]);
  T('no page errors', errs.length === 0, errs);

  await browser.close(); srv.close(); await pool.end(); await pg.end(); await admin.query(`drop database ${DB}`); await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.end();
  const bad = out.filter(x => !x).length; console.log(bad ? `${bad} FAILED of ${out.length}` : `ALL ${out.length} PASS`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ERROR', e.stack || e.message); process.exit(2); });
