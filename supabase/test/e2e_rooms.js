// Three pupils and a teacher, four browsers, two rooms — real pages against a LOCAL throwaway Postgres as role anon.   node supabase/test/e2e_rooms.js
const { chromium } = require(process.env.PW_MODULE || 'playwright'); const { Client, Pool } = require(process.env.PG_MODULE || 'pg');
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..'), DIR = path.join(__dirname, '..'), DB = 'esep_test_e2erm_' + Date.now();
const cfg = db => ({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: db });
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(x)); };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const passed = ts => ({ AR: { diag: { placed: 'AR-01', t: 1 }, stages: Object.fromEntries(ts.map(t => [({ 2: 'AR-04', 5: 'AR-05', 10: 'AR-06', 3: 'AR-09' })[t], { status: 'passed', level: 3, tests: [] }])) } });
(async () => {
  const srv = http.createServer((q, s) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => e ? (s.writeHead(404), s.end()) : (s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }), s.end(b))); }).listen(8769);
  const admin = new Client(cfg('postgres')); await admin.connect();
  for (const d of (await admin.query(`select datname from pg_database where datname like 'esep_test_%'`)).rows) await admin.query(`drop database ${d.datname}`);
  await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.query(`create database ${DB}`);
  const pg = new Client(cfg(DB)); await pg.connect(); const pool = new Pool(Object.assign(cfg(DB), { max: 8 })); const file = f => pg.query(fs.readFileSync(path.join(DIR, f), 'utf8'));
  for (const f of ['test/00_baseline_guess.sql', '01_additive.sql', '02_lock.sql', '04_challenges.sql']) await file(f);
  await pg.query(`select esep_private.set_teacher_secret('мұғалім-құпиясы-2026')`);
  const anon = async (sql, args) => { const c = await pool.connect(); try { await c.query('set role anon'); return await c.query(sql, args); } finally { await c.query('reset role').catch(() => {}); c.release(); } };
  const who = {}; for (const [n, k, ts] of [['Айгүл С.', '3А', [2, 5, 10]], ['Ерасыл Т.', '3А', [5]], ['Дана К.', '4Б', []]]) { const r = (await anon(`select public.esep_login($1,'1111',$2) v`, [n, k])).rows[0].v; who[n] = { id: r.student.id, name: n, klass: k, token: r.token }; await pg.query(`update students set state=$2 where id=$1`, [r.student.id, JSON.stringify(passed(ts))]); }

  const backend = async route => { const rq = route.request(), m = new URL(rq.url()).pathname.match(/^\/rest\/v1\/rpc\/(esep_[a-z_]+)$/); if (!m) return route.fulfill({ status: 401, body: '{}' });
    try { const args = JSON.parse(rq.postData() || '{}'), k = Object.keys(args);
      const r = await anon(`select public.${m[1]}(${k.map((x, i) => `${x.replace(/\W/g, '')} => $${i + 1}`).join(', ')}) v`, k.map(x => args[x] !== null && typeof args[x] === 'object' ? JSON.stringify(args[x]) : args[x]));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.rows[0].v) }).catch(() => {});
    } catch (e) { return route.fulfill({ status: /does not exist/.test(e.message) ? 404 : 400, contentType: 'application/json', body: JSON.stringify({ message: e.message }) }).catch(() => {}); } };
  const browser = await chromium.launch(); const errs = [];
  const ctxOf = async (vp) => { const ctx = await browser.newContext({ viewport: vp || { width: 390, height: 860 }, deviceScaleFactor: 2 }); await ctx.route(/supabase\.co/, backend); await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort()); return ctx; };
  const as = async n => { const ctx = await ctxOf(); await ctx.addInitScript(s => localStorage.setItem('esep_session_v1', JSON.stringify(s)), who[n]); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(n + ': ' + e.message)); return p; };
  const B = 'http://localhost:8769/'; const A = await as('Айгүл С.'), E = await as('Ерасыл Т.'), D = await as('Дана К.');
  const shot = (p, f) => p.screenshot({ path: path.join(__dirname, f), fullPage: true });
  // answer every fact on the screen; `wrong` = how many of the last ones to get wrong
  const playAll = async (p, wrong = 0) => { await p.waitForSelector('#qt', { timeout: 9000 }); const from = parseInt(await p.locator('#qn').innerText(), 10) - 1; for (let i = from; i < 10; i++) { const [a, b] = (await p.locator('#qt').innerText()).split('×').map(Number); await p.keyboard.type(String(i >= 10 - wrong ? 1 : a * b)); await p.keyboard.press('Enter'); } };

  await A.goto(B); await A.waitForSelector('.ring'); await A.waitForTimeout(500);
  T('before 05_rooms.sql is installed the portal shows no room card, and no errors', (await A.locator('#rooms').innerText()).trim() === '' && errs.length === 0, errs);
  await file('05_rooms.sql');
  await A.reload(); await A.waitForSelector('#roomGo');
  T('portal: «Жарыс бөлмесі» card with a button', /Жарыс бөлмесі/.test(await A.locator('#roomGo').innerText()) && (await A.locator('#roomGo a.btn').count()) === 1);

  // ── a pupil opens a room
  await A.click('#roomGo a.btn'); await A.waitForSelector('[data-new]');
  T('hub: I may host only the tables I have passed (2, 5, 10) + a mix', JSON.stringify(await A.locator('[data-new]').evaluateAll(b => b.map(x => +x.dataset.new))) === '[2,5,10,0]');
  await D.goto(B + 'room/'); await D.waitForSelector('#jcode');
  T('hub: a pupil with no passed table cannot host — but can come in by code', (await D.locator('[data-new]').count()) === 0 && /кодпен басқаның бөлмесіне кіре аласың/.test(await D.locator('#app').innerText()));
  await A.locator('[data-new="5"]').click(); await A.waitForSelector('#rcode'); const code = (await A.locator('#rcode').innerText()).trim();
  T('lobby: a four-digit code, «Бастау» disabled while alone', /^\d{4}$/.test(code) && await A.locator('#startBtn').isDisabled(), code);
  await shot(A, 'room-lobby.png');

  // ── a classmate sees it on the portal; another class comes in by code
  await E.goto(B); await E.waitForSelector('#rooms .card');
  T('portal of a classmate: «Айгүл жарыс бөлмесін ашты» + «Қосылу»', /Айгүл жарыс бөлмесін ашты/.test(await E.locator('#rooms').innerText()));
  await E.locator('#rooms a.btn', { hasText: 'Қосылу' }).click(); await E.waitForSelector('#rcode');
  T('…one tap and he is in the lobby, no code typed', (await E.locator('#rcode').innerText()).trim() === code && /Айгүл ашқан бөлме/.test(await E.locator('#app').innerText()));
  await D.fill('#jcode', '0000'); await D.click('#jgo'); await D.waitForFunction(() => /жоқ/.test(document.getElementById('jmsg').textContent));
  T('wrong code: a plain message, still on the hub', (await D.locator('#jcode').count()) === 1);
  await D.fill('#jcode', code); await D.click('#jgo'); await D.waitForSelector('#rcode');
  T('another class, by code: in — and told she has not passed this table yet', /әлі өткен жоқсың/.test(await D.locator('#app').innerText()));
  await A.waitForFunction(() => document.querySelectorAll('.plist span').length === 3, null, { timeout: 8000 });
  T('the host sees all three names arrive; «Бастау» is live', !(await A.locator('#startBtn').isDisabled()) && /Ерасыл/.test(await A.locator('.plist').innerText()) && /Дана/.test(await A.locator('.plist').innerText()));

  // ── the race
  await A.click('#startBtn');
  await Promise.all([A, E, D].map(p => p.waitForSelector('#cnt, #qt', { timeout: 8000 })));
  T('everybody gets the countdown without touching anything', true);
  await A.waitForSelector('#qt', { timeout: 9000 }); const factsA = await A.locator('#qt').innerText(); await E.waitForSelector('#qt', { timeout: 9000 });
  T('the same first fact on every screen', factsA === await E.locator('#qt').innerText() && factsA === await D.locator('#qt').innerText(), factsA);
  await shot(E, 'room-play.png');
  await playAll(E, 0); await E.waitForSelector('text=Жауаптарың қабылданды');
  T('first to finish waits: «1 / 3 ойыншы аяқтады», no ranking yet', /1 \/ 3 ойыншы аяқтады/.test(await E.locator('#app').innerText()) && !/орын/.test(await E.locator('#app').innerText()));
  // a reload in the middle of the race: she is back at the fact she had reached, and the clock did not restart for her
  await D.waitForSelector('#qt'); for (let i = 0; i < 3; i++) { const [a, b] = (await D.locator('#qt').innerText()).split('×').map(Number); await D.keyboard.type(String(a * b)); await D.keyboard.press('Enter'); }
  await D.reload(); await D.waitForSelector('#qt', { timeout: 9000 });
  T('reload mid-race: back at fact 4 of 10 with the first three kept', /^4 \/ 10$/.test((await D.locator('#qn').innerText()).trim()) && (await D.locator('#marks i.ok').count()) === 3, await D.locator('#qn').innerText());
  // mouse on the keypad, then Enter on the keyboard: the focused key must not be pressed a second time
  { const [a, b] = (await D.locator('#qt').innerText()).split('×').map(Number); for (const ch of String(a * b)) await D.locator(`[data-k="${ch}"]`).click(); await D.keyboard.press('Enter'); }
  T('click a digit, then press Enter: the next answer box starts empty', /^5 \/ 10$/.test((await D.locator('#qn').innerText()).trim()) && (await D.locator('#out').innerText()).trim() === '', await D.locator('#out').innerText());
  await A.waitForTimeout(1200); await playAll(A, 0); await playAll(D, 4);
  await Promise.all([A, E, D].map(p => p.waitForSelector('.res', { timeout: 9000 })));
  const tE = await E.locator('#app').innerText(), tA = await A.locator('#app').innerText(), tD = await D.locator('#app').innerText();
  T('podium: Ерасыл won (10/10, fastest), Айгүл second, Дана third with 6/10', /Жеңдің!/.test(tE) && /сен 2 ойыншыдан оздың/.test(tE) && /2-орын!/.test(tA) && /3-орын!/.test(tD) && /6 \/ 10/.test(tD), { tE, tA, tD });
  T('stars: three for the winner; the missed facts come back for revision', /Саған 3 жұлдыз/.test(tE) && /Қайталап ал/.test(tD) && !/Қайталап ал/.test(tE));
  await shot(D, 'room-podium.png');
  await E.goto(B + 'room/'); await E.waitForSelector('.rec');
  T('hub record: 1 жарыс · 1 жеңіс · озған адам 2', JSON.stringify(await E.locator('.rec b').allInnerTexts()) === '["1","1","1","2"]', await E.locator('.rec').innerText());

  // ── the teacher: any table, the code on the board, the whole ranking
  const tctx = await ctxOf({ width: 1100, height: 800 }); const P = await tctx.newPage(); P.on('pageerror', e => errs.push('teacher: ' + e.message));
  await P.goto(B + 'teacher/'); await P.fill('#tpin', 'мұғалім-құпиясы-2026'); await P.click('#tgo'); await P.waitForSelector('#roomEntry');
  await P.click('#roomEntry button'); await P.waitForSelector('#rnew'); await P.selectOption('#rtab', '7'); await P.selectOption('#rkl', '3А'); await P.click('#rnew'); await P.waitForSelector('#rstart');
  const tcode = ((await P.locator('#roomView').innerText()).match(/\b\d{4}\b/) || [])[0];
  T('teacher opens a room on the 7 table (nobody has passed it): a big code, «Бастау» disabled', /^\d{4}$/.test(tcode) && await P.locator('#rstart').isDisabled(), tcode);
  await shot(P, 'room-teacher-lobby.png');
  await A.goto(B); await A.waitForSelector('#rooms .card');
  T('class 3А sees «Мұғалім жарыс бөлмесін ашты» on the portal', /Мұғалім жарыс бөлмесін ашты/.test(await A.locator('#rooms').innerText()));
  await A.locator('#rooms a.btn', { hasText: 'Қосылу' }).click(); await A.waitForSelector('#rcode');
  await E.goto(B + 'room/?code=' + tcode); await E.waitForSelector('#rcode');
  T('pupils in the teacher\'s room have no «Бастау»', (await A.locator('#startBtn').count()) === 0 && /Мұғалім бастағанша күт/.test(await A.locator('#app').innerText()));
  await P.waitForFunction(() => { const b = document.getElementById('rstart'); return b && !b.disabled; }, null, { timeout: 8000 });
  await P.click('#rstart'); await playAll(A, 2); await playAll(E, 0);
  await P.waitForSelector('#roomView table', { timeout: 12000 }); const rank = await P.locator('#roomView table').innerText();
  T('teacher gets the WHOLE ranking: Ерасыл 10/10 first, Айгүл 8/10 second', /1\s+Ерасыл Т\.\s+10 \/ 10/.test(rank) && /2\s+Айгүл С\.\s+8 \/ 10/.test(rank), rank);
  await shot(P, 'room-teacher-ranking.png');
  // «← бөлмелер» while a poll is in the air must not bounce the teacher back into the room
  await P.click('text=Тағы бір бөлме'); await P.waitForSelector('#rnew'); await P.click('text=← тізім'); await P.waitForSelector('#roomEntry'); await P.waitForTimeout(2600);
  T('teacher: leaving the room views stays left (no stale poll repaints them)', (await P.locator('#roomEntry').count()) === 1 && (await P.locator('#roomView').count()) === 0);
  T('no page errors', errs.length === 0, errs);

  await browser.close(); srv.close(); await pool.end(); await pg.end(); await admin.query(`drop database ${DB}`); await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.end();
  const bad = out.filter(x => !x).length; console.log(bad ? `${bad} FAILED of ${out.length}` : `ALL ${out.length} PASS`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ERROR', e.stack || e.message); process.exit(2); });
