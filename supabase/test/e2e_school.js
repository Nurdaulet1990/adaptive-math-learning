// The teacher page's «Мектеп» tab: per class, how many pupils answered at least N questions on a day, and the week.
// Real page (served from this repo) → Playwright intercepts every request to *.supabase.co and executes it against a
// LOCAL throwaway Postgres as the `anon` role. Nothing here ever reaches the real project.   node supabase/test/e2e_school.js
// SHOTS=<folder> also saves a desktop and a phone screenshot and a print PDF, for a human to look at.
const { chromium } = require(process.env.PW_MODULE || 'playwright'); const { Client, Pool } = require(process.env.PG_MODULE || 'pg');
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..'), DIR = path.join(__dirname, '..'), DB = 'esep_test_school_' + Date.now();
const SHOTS = process.env.SHOTS || '';
const conn = db => new Client({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: db });
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(x)); };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
(async () => {
  const srv = http.createServer((q, s) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith(path.sep) || fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => e ? (s.writeHead(404), s.end()) : (s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }), s.end(b))); }).listen(8768);
  const admin = conn('postgres'); await admin.connect();
  for (const d of (await admin.query(`select datname from pg_database where datname like 'esep_test_school%'`)).rows) await admin.query(`drop database ${d.datname} with (force)`);
  await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.query(`create database ${DB}`);
  const pg = conn(DB); await pg.connect(); const file = f => pg.query(fs.readFileSync(path.join(DIR, f), 'utf8'));
  await file('test/00_baseline_guess.sql');
  const evil = `"><img src=x onerror="window.__xss=1">`;
  const pupils = [['Айгүл С.', '2 QYRAN'], ['Дана К.', '2 QYRAN'], ['Ерасыл Т.', '2 QYRAN'], ['Мадина Ә.', '2 QYRAN'],
    ['Сәуле М.', '3 SAMURYQ'], ['Бекзат Р.', '3 SAMURYQ'], ['Нұрлан Б.', '4 BARYS'], ['Арман Ж.', ''], ['tester', '2 QYRAN'], ['Әлихан', evil]];
  const id = {}; for (const [n, k] of pupils) id[n] = (await pg.query(`insert into students(name,pin,klass) values ($1,'1111',$2) returning id`, [n, k])).rows[0].id;
  for (const f of ['01_additive.sql', '02_lock.sql', '06_stars.sql', '07_practice_stars.sql', '08_classes.sql', '13_grades.sql', '20_activity.sql']) await file(f);
  await pg.query(`select esep_private.set_teacher_secret('мұғалім-құпиясы-2026')`);
  // the per-day answer counts esep_events keeps (run_activity.js checks that path; here the page is under test)
  const kz = async n => (await pg.query(`select (esep_private.kz_day(now()) + $1::int)::text d`, [n])).rows[0].d;
  const today = await kz(0), yest = await kz(-1);
  const day = async (who, d, answers) => pg.query(`insert into esep_private.day_stats(student_id,day,events,answers,score) values ($1,$2,$3,$3,0)
    on conflict (student_id,day) do update set answers = excluded.answers`, [id[who], d, answers]);
  await day('Айгүл С.', today, 25); await day('Дана К.', today, 12); await day('Ерасыл Т.', today, 7);
  await pg.query(`insert into esep_private.day_stats(student_id,day,events,answers,score) values ($1,$2,30,0,0)`, [id['Мадина Ә.'], today]);   // events, but no answer
  await day('Сәуле М.', today, 10); await day('Арман Ж.', today, 7); await day('tester', today, 99); await day('Әлихан', today, 11);
  await day('Айгүл С.', yest, 15); await day('Бекзат Р.', yest, 20); await day('Нұрлан Б.', yest, 1);

  const pool = new Pool({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: DB, max: 6 });
  const seen = [], calls = {}; let fail500 = 0;
  const backend = async route => { const rq = route.request(), u = new URL(rq.url()); seen.push(rq.method() + ' ' + u.pathname);
    const m = u.pathname.match(/^\/rest\/v1\/rpc\/(esep_[a-z_]+)$/); if (m) calls[m[1]] = (calls[m[1]] || 0) + 1;
    if (m && m[1] === 'esep_t_activity' && fail500 > 0) { fail500--; return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"upstream timeout"}' }); }
    const c = await pool.connect();
    try { await c.query('set role anon');
      if (!m) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      const args = JSON.parse(rq.postData() || '{}'), keys = Object.keys(args);
      const r = await c.query(`select public.${m[1]}(${keys.map((k, i) => `${k.replace(/\W/g, '')} => $${i + 1}`).join(', ')}) as v`, keys.map(k => args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.rows[0].v) }).catch(() => {});
    } catch (e) { const gone = /does not exist/.test(e.message);   // PostgREST answers a missing function with 404 PGRST202
      return route.fulfill({ status: gone ? 404 : /permission denied/.test(e.message) ? 401 : 400, contentType: 'application/json', body: JSON.stringify(gone ? { code: 'PGRST202', message: `Could not find the function public.${m && m[1]} in the schema cache` } : { message: e.message }) }).catch(() => {}); }
    finally { await c.query('reset role').catch(() => {}); c.release(); } };

  const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  // the device clock is in another zone on purpose: the page must still count Kazakhstan days
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1100, height: 900 }, timezoneId: 'America/New_York', locale: 'en-US' });
  await ctx.route(/supabase\.co/, backend); await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const errs = []; const B = 'http://localhost:8768/';
  const tp = await ctx.newPage(); tp.on('pageerror', e => errs.push(e.message));
  const ready = () => tp.waitForSelector('#scK', { state: 'attached' });
  await tp.goto(B + 'teacher/'); await tp.waitForSelector('#tpin');
  await tp.fill('#tpin', 'мұғалім-құпиясы-2026'); await tp.click('#tgo'); await tp.waitForSelector('.ttabs');
  T('the header has a «Мектеп» tab', await tp.locator('.ttabs a[href="#mek"]').count() === 1);
  await tp.click('.ttabs a[href="#mek"]'); await ready();
  const row = async k => (await tp.locator(`#scT tr[data-k="${k}"]`).innerText()).replace(/\s+/g, ' ');
  const kpi = async () => (await tp.locator('#scK').innerText()).replace(/\s+/g, ' ');
  T('the day is the Kazakhstan day even on a New York clock', (await tp.inputValue('#sday')) === today, await tp.inputValue('#sday'));
  T('N defaults to 10', (await tp.locator('#scN button[aria-pressed="true"]').innerText()) === '10');
  T('2 QYRAN, N=10: Айгүл 25 and Дана 12 → 2 / 4 · 50% (Ерасыл 7, Мадина no answer, tester not counted)', /2 \/ 4 · 50%/.test(await row('2 QYRAN')), await row('2 QYRAN'));
  T('3 SAMURYQ, N=10: Сәуле 10 → 1 / 2 · 50%', /1 \/ 2 · 50%/.test(await row('3 SAMURYQ')), await row('3 SAMURYQ'));
  T('4 BARYS: 0 / 1 today', /0 \/ 1 · 0%/.test(await row('4 BARYS')), await row('4 BARYS'));
  T('the pupil with no class is its own row «Сыныбы жоқ» (Арман 7 → 0 at N=10)', /Сыныбы жоқ 1 0 \/ 1/.test(await row('')), await row(''));
  T('school total at N=10: 4 / 9 (tester left out)', /4 \/ 9/.test(await kpi()), await kpi());
  T('«ешкім жұмыс істемеген сынып» lists 4 BARYS and Сыныбы жоқ', /2 ешкім жұмыс істемеген сынып 4 BARYS, Сыныбы жоқ/.test(await kpi()), await kpi());
  const before = calls.esep_t_activity;
  await tp.locator('#scN button[data-n="1"]').click();
  T('switching N redraws without asking the server again', calls.esep_t_activity === before && (await tp.locator('#scN button[aria-pressed="true"]').innerText()) === '1');
  T('N=1: 2 QYRAN 3 / 4 (Ерасыл counts now; Мадина still does not)', /3 \/ 4 · 75%/.test(await row('2 QYRAN')), await row('2 QYRAN'));
  T('N=1: school 6 / 9', /6 \/ 9/.test(await kpi()), await kpi());
  T('N=1: «алдыңғы күні» = 3 (Айгүл, Бекзат, Нұрлан yesterday)', /3 алдыңғы күні/.test(await kpi()), await kpi());
  const cells = await tp.$$eval('#scT tr[data-k="2 QYRAN"] td.sc-d', tds => tds.map(t => t.textContent.trim()));
  T('the week: seven cells, yesterday 1, today 3, older days empty', cells.length === 7 && cells[6] === '3' && cells[5] === '1' && cells.slice(0, 5).every(c => c === '·'), cells);
  T('the hostile class name is shown as text, nothing runs', (await tp.evaluate(() => window.__xss)) === undefined && (await tp.locator('#scData img').count()) === 0 && /onerror/i.test(await tp.locator('#scT').innerText()));
  T('no pupil name is on the page', !/Айгүл|Дана|Ерасыл|Сәуле|Бекзат|Нұрлан|Арман|Әлихан|Мадина/.test(await tp.locator('#app').innerText()));
  T('the class chips are hidden on this tab', await tp.locator('.tright .tchip').count() === 0);

  // a pupil who registers while the page is open is in the class size of the next day loaded
  await pg.query(`insert into students(name,pin,klass) values ('Жаңа Б.','1111','4 BARYS')`);
  await tp.click('#scYest'); await tp.waitForFunction(y => ((document.getElementById('scK') || {}).innerText || '').includes(y), `${yest.slice(8)}.${yest.slice(5, 7)}`);
  T('«Кеше» at N=1: 3 SAMURYQ 1 / 2 (Бекзат), 2 QYRAN 1 / 4 (Айгүл 15)', /1 \/ 2/.test(await row('3 SAMURYQ')) && /1 \/ 4/.test(await row('2 QYRAN')), [await row('3 SAMURYQ'), await row('2 QYRAN')]);
  T('…and the class sizes were read again: 4 BARYS now has 2 pupils', /^4 BARYS 2 1 \/ 2/.test(await row('4 BARYS')), await row('4 BARYS'));

  // typing a date: one request when the typing stops, and the input is not rebuilt under the fingers
  const n0 = calls.esep_t_activity; await tp.click('#sday'); await tp.keyboard.press('ArrowLeft'); await tp.keyboard.press('ArrowLeft');
  await tp.keyboard.type('09012026', { delay: 60 }); await tp.waitForTimeout(1600);
  T('typing 09/01/2026 sends ONE request after the typing stops', calls.esep_t_activity - n0 === 1, calls.esep_t_activity - n0);
  T('…the input kept its focus (it was not rebuilt)', await tp.evaluate(() => document.activeElement && document.activeElement.id === 'sday'));
  T('…and the day with nothing shows 0 / 10, every class idle', /0 \/ 10/.test(await kpi()) && /01\.09/.test(await kpi()), await kpi());

  // a server hiccup is not «not installed»
  fail500 = 1; await tp.click('#scToday'); await tp.waitForSelector('#scData button.btn');
  T('a 500 says «Базаға қосылу мүмкін болмады» with a retry, not «20_activity.sql»', /Базаға қосылу мүмкін болмады/.test(await tp.locator('#scData').innerText()) && !/20_activity/.test(await tp.locator('#scData').innerText()));
  await tp.click('#scData button.btn'); await ready();
  T('…«Қайталау» loads it', /6 \/ 10/.test(await kpi()), await kpi());

  if (SHOTS) { await tp.locator('#scN button[data-n="10"]').click(); await tp.screenshot({ path: path.join(SHOTS, 'school-desktop.png'), fullPage: true });
    await tp.emulateMedia({ media: 'print' }); await tp.pdf({ path: path.join(SHOTS, 'school-print.pdf'), format: 'A4', landscape: true, printBackground: true }); await tp.emulateMedia({ media: 'screen' }); }
  await tp.setViewportSize({ width: 390, height: 844 }); await tp.reload(); await ready();
  T('a reload keeps the tab (#mek), and N is back to 10', (await tp.locator('#scN button[aria-pressed="true"]').innerText()) === '10');
  const it = (await tp.locator('#scL .sc-item[data-k="2 QYRAN"]').innerText()).replace(/\s+/g, ' ');
  T('phone: one card per class instead of the table, same numbers (2 QYRAN 2 / 4 · 50%, today 2)', await tp.locator('#scT').isHidden() && /2 \/ 4 · 50%/.test(it) && / 2$/.test(it), it);
  T('phone: nothing sticks out sideways', await tp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  if (SHOTS) await tp.screenshot({ path: path.join(SHOTS, 'school-phone.png'), fullPage: true });
  await tp.setViewportSize({ width: 1100, height: 900 });

  // not installed: the tab says so and the rest of the page still works
  await file('20_rollback.sql'); await tp.reload(); await tp.waitForFunction(() => /20_activity\.sql/.test(document.body.innerText));
  T('without 20: «орнатылмаған … 20_activity.sql»', /орнатылмаған/.test(await tp.locator('#scData').innerText()));
  await tp.click('.ttabs a[href="#bugin"]'); await tp.waitForSelector('#kpis');
  T('…and «Бүгін» still opens', await tp.locator('.ttabs a[href="#bugin"][aria-current="page"]').count() === 1);
  T('no direct table request was ever made', !seen.some(x => !/\/rpc\/esep_/.test(x)), [...new Set(seen.filter(x => !/\/rpc\/esep_/.test(x)))]);
  T('no page errors', errs.length === 0, errs);

  await browser.close(); srv.close(); await pool.end(); await pg.end(); await admin.query(`drop database ${DB} with (force)`); await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.end();
  const bad = out.filter(x => !x).length; console.log(bad ? `${bad} FAILED of ${out.length}` : `ALL ${out.length} PASSED`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
